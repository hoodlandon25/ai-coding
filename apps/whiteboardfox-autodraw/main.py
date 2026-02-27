#!/usr/bin/env python3
"""
Embedded WhiteboardFox browser + auto draw trainer.
Does not use system Chrome/Firefox.
"""

import os
import sys
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import urlparse

import cv2
from PyQt6.QtCore import QEvent, QTimer, Qt, QUrl
from PyQt6.QtGui import QPixmap
from PyQt6.QtWidgets import (
    QApplication,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFileDialog,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLineEdit,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSizePolicy,
    QSlider,
    QToolButton,
    QVBoxLayout,
    QWidget,
)
from PyQt6.QtWebEngineCore import (
    QWebEnginePage,
    QWebEngineProfile,
    QWebEngineSettings,
    QWebEngineUrlRequestInterceptor,
)
from PyQt6.QtWebEngineWidgets import QWebEngineView


TARGET_URL = "https://r9.whiteboardfox.com/"
ALLOWED_DOMAIN = "whiteboardfox.com"
CHROMEBOOK_DOWNLOADS = "/mnt/chromeos/MyFiles/Downloads"
PROFILE_DIR = os.path.expanduser("~/.local/share/whiteboardfox-autodraw/profile")
ALLOWED_TOP_LEVEL_SUFFIXES = (
    ".whiteboardfox.com",
    ".google.com",
    ".gstatic.com",
    ".googleapis.com",
    ".googleusercontent.com",
    ".firebaseapp.com",
)
ALLOWED_TOP_LEVEL_EXACT = {
    "whiteboardfox.com",
    "google.com",
    "www.google.com",
    "accounts.google.com",
    "oauthaccountmanager.google.com",
    "myaccount.google.com",
    "apis.google.com",
}
GOOGLE_AUTH_PATH_HINTS = (
    "/signin",
    "/v3/signin",
    "/servicelogin",
    "/oauth",
    "/o/oauth2",
    "/accountchooser",
    "/challenge",
    "/checkcookie",
    "/consent",
)
AD_TRACKER_HOST_SUFFIXES = (
    ".doubleclick.net",
    ".googlesyndication.com",
    ".googleadservices.com",
    ".googletagmanager.com",
    ".adsafeprotected.com",
    ".adnxs.com",
    ".taboola.com",
    ".outbrain.com",
)
FAST_MODE_ALLOWED_SUFFIXES = (
    ".whiteboardfox.com",
    ".firebaseapp.com",
    ".google.com",
    ".googleapis.com",
    ".googleusercontent.com",
    ".gstatic.com",
)
FAST_MODE_ALLOWED_EXACT = {
    "whiteboardfox.com",
    "accounts.google.com",
    "oauthaccountmanager.google.com",
    "myaccount.google.com",
    "apis.google.com",
}


@dataclass
class DrawZone:
    x1: int
    y1: int
    x2: int
    y2: int

    @property
    def left(self):
        return min(self.x1, self.x2)

    @property
    def top(self):
        return min(self.y1, self.y2)

    @property
    def width(self):
        return abs(self.x2 - self.x1)

    @property
    def height(self):
        return abs(self.y2 - self.y1)


def is_google_host(host: str) -> bool:
    host = host.lower().strip()
    return host == "google.com" or host.endswith(".google.com")


def is_whiteboardfox_host(host: str) -> bool:
    host = host.lower().strip()
    return host == "whiteboardfox.com" or host.endswith(".whiteboardfox.com")


def is_allowed_google_auth_url(url_s: str) -> bool:
    p = urlparse(url_s)
    host = p.netloc.lower()
    path = p.path.lower()
    if not is_google_host(host):
        return False
    if host == "accounts.google.com":
        return True
    return any(hint in path for hint in GOOGLE_AUTH_PATH_HINTS)


def is_allowed_main_frame_url(url_s: str) -> bool:
    # Relaxed navigation policy so Google OAuth multi-step redirects can complete.
    # Restrict only by scheme (web URLs only).
    p = urlparse(url_s)
    return p.scheme in ("http", "https")


def is_allowed_main_frame_host(host: str) -> bool:
    return bool((host or "").strip())


def normalize_board_url(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        return TARGET_URL
    parsed = urlparse(raw)
    if not parsed.scheme:
        raw = f"https://{raw}"
        parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https"):
        return TARGET_URL
    if not is_allowed_main_frame_url(parsed.geturl()):
        return TARGET_URL
    return parsed.geturl()


class LockedPage(QWebEnginePage):
    def __init__(self, profile, app, is_popup=False):
        super().__init__(profile, app.view)
        self.app = app
        self.is_popup = is_popup

    def acceptNavigationRequest(self, url, nav_type, is_main_frame):
        url_s = url.toString()
        # OAuth popups often start on about:blank/chrome://about before redirecting.
        # Ignore these placeholders instead of treating them as blocked navigation.
        if is_main_frame and url_s in ("about:blank", "chrome://about", "chrome://about/"):
            return True
        host = urlparse(url_s).netloc.lower()
        # If a popup lands on a WhiteboardFox room, force it into the main window.
        if is_main_frame and self.is_popup and is_whiteboardfox_host(host):
            self.app.view.setUrl(url)
            self.app.set_status(f"Opened in main window: {host}")
            v = self.view()
            if v is not None:
                v.window().close()
            return False
        if is_main_frame and not is_allowed_main_frame_url(url_s):
            self.app.set_status(f"Blocked navigation to: {host or url_s}")
            return False
        return super().acceptNavigationRequest(url, nav_type, is_main_frame)

    def createWindow(self, _type):
        # Some OAuth flows only work when a real page object is returned.
        # We still keep popups hidden by routing captured URLs to the main view.
        return self.app.create_auth_popup_page()


class RequestFilter(QWebEngineUrlRequestInterceptor):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.fast_mode = False

    def set_fast_mode(self, enabled: bool):
        self.fast_mode = bool(enabled)

    def _is_fast_mode_allowed(self, host: str) -> bool:
        if host in FAST_MODE_ALLOWED_EXACT:
            return True
        return any(host.endswith(sfx) for sfx in FAST_MODE_ALLOWED_SUFFIXES)

    def interceptRequest(self, info):
        host = info.requestUrl().host().lower()
        if not host:
            return
        # Do not always block ad/tracker domains because some sites detect this
        # as an ad blocker and break auth/session flows.
        if self.fast_mode and any(host.endswith(sfx) for sfx in AD_TRACKER_HOST_SUFFIXES):
            info.block(True)
            return
        if self.fast_mode and not self._is_fast_mode_allowed(host):
            info.block(True)


class BoardView(QWebEngineView):
    def __init__(self, app):
        super().__init__()
        self.app = app

    def mousePressEvent(self, event):
        if self.app.is_drawing:
            event.accept()
            return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self.app.is_drawing:
            event.accept()
            return
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if self.app.is_drawing:
            event.accept()
            return
        super().mouseReleaseEvent(event)


class AuthPopupWindow(QMainWindow):
    def __init__(self, app, profile):
        super().__init__()
        self.app = app
        self.setWindowTitle("Google Sign-In")
        self.resize(920, 760)
        self.view = QWebEngineView(self)
        self.page = QWebEnginePage(profile, self.view)
        self.view.setPage(self.page)
        self.setCentralWidget(self.view)
        self.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose, True)

    def closeEvent(self, event):
        self.view.setPage(None)
        try:
            self.page.deleteLater()
        except RuntimeError:
            pass
        super().closeEvent(event)


class ImagePickerDialog(QDialog):
    IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".bmp", ".webp")

    def __init__(self, start_dir: str, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Choose Image")
        self.resize(980, 620)
        self.current_dir = start_dir if os.path.isdir(start_dir) else os.path.expanduser("~")
        self.selected_path = None
        self._build_ui()
        self.refresh_file_list()

    def _build_ui(self):
        root = QVBoxLayout(self)

        controls = QHBoxLayout()
        self.dir_label = QLabel(self.current_dir, self)
        self.dir_label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        self.folder_btn = QPushButton("Folder", self)
        self.folder_btn.clicked.connect(self.choose_folder)
        controls.addWidget(self.dir_label, 1)
        controls.addWidget(self.folder_btn)
        root.addLayout(controls)

        filters = QHBoxLayout()
        self.search = QLineEdit(self)
        self.search.setPlaceholderText("Search images by filename...")
        self.search.textChanged.connect(self.refresh_file_list)
        self.sort_combo = QComboBox(self)
        self.sort_combo.addItems(["Most Recent", "Biggest", "Smallest", "Name"])
        self.sort_combo.currentTextChanged.connect(self.refresh_file_list)
        filters.addWidget(self.search, 1)
        filters.addWidget(self.sort_combo)
        root.addLayout(filters)

        grid = QGridLayout()
        self.file_list = QListWidget(self)
        self.file_list.currentItemChanged.connect(self.on_item_changed)
        self.preview = QLabel("Select an image to preview", self)
        self.preview.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.preview.setMinimumSize(420, 420)
        self.preview.setStyleSheet("border: 1px solid #2a2a35; border-radius: 8px;")
        grid.addWidget(self.file_list, 0, 0)
        grid.addWidget(self.preview, 0, 1)
        grid.setColumnStretch(0, 4)
        grid.setColumnStretch(1, 5)
        root.addLayout(grid, 1)

        self.buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Open | QDialogButtonBox.StandardButton.Cancel,
            parent=self,
        )
        self.open_btn = self.buttons.button(QDialogButtonBox.StandardButton.Open)
        self.open_btn.setEnabled(False)
        self.buttons.accepted.connect(self.accept_selection)
        self.buttons.rejected.connect(self.reject)
        root.addWidget(self.buttons)

    def choose_folder(self):
        folder = QFileDialog.getExistingDirectory(self, "Choose Folder", self.current_dir)
        if not folder:
            return
        self.current_dir = folder
        self.dir_label.setText(folder)
        self.selected_path = None
        self.open_btn.setEnabled(False)
        self.preview.setText("Select an image to preview")
        self.refresh_file_list()

    def _iter_images(self):
        out = []
        try:
            for entry in os.scandir(self.current_dir):
                if not entry.is_file():
                    continue
                name_l = entry.name.lower()
                if not name_l.endswith(self.IMAGE_EXTS):
                    continue
                st = entry.stat()
                out.append(
                    {
                        "path": entry.path,
                        "name": entry.name,
                        "size": st.st_size,
                        "mtime": st.st_mtime,
                    }
                )
        except Exception:
            return []
        return out

    def refresh_file_list(self):
        query = self.search.text().strip().lower()
        files = self._iter_images()
        if query:
            files = [f for f in files if query in f["name"].lower()]

        mode = self.sort_combo.currentText()
        if mode == "Most Recent":
            files.sort(key=lambda f: f["mtime"], reverse=True)
        elif mode == "Biggest":
            files.sort(key=lambda f: f["size"], reverse=True)
        elif mode == "Smallest":
            files.sort(key=lambda f: f["size"])
        else:
            files.sort(key=lambda f: f["name"].lower())

        self.file_list.clear()
        for f in files:
            stamp = datetime.fromtimestamp(f["mtime"]).strftime("%Y-%m-%d %H:%M")
            size_kb = max(1, f["size"] // 1024)
            text = f'{f["name"]}  |  {size_kb} KB  |  {stamp}'
            item = QListWidgetItem(text)
            item.setData(Qt.ItemDataRole.UserRole, f["path"])
            self.file_list.addItem(item)

    def on_item_changed(self, current, _previous):
        if current is None:
            self.selected_path = None
            self.open_btn.setEnabled(False)
            self.preview.setText("Select an image to preview")
            return
        path = current.data(Qt.ItemDataRole.UserRole)
        self.selected_path = path
        self.open_btn.setEnabled(True)
        self._update_preview()

    def _update_preview(self):
        if not self.selected_path:
            return
        pix = QPixmap(self.selected_path)
        if pix.isNull():
            self.preview.setText("Preview unavailable")
            return
        self.preview.setPixmap(
            pix.scaled(
                self.preview.size(),
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation,
            )
        )

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if self.selected_path:
            self._update_preview()

    def accept_selection(self):
        if self.selected_path:
            self.accept()


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("WhiteboardFox Browser Auto Draw")
        self.setWindowFlags(self.windowFlags() | Qt.WindowType.FramelessWindowHint)
        self.resize(1300, 850)
        self._drag_pos = None

        self.image_path = None
        self.zone = None
        self.selecting_zone = False
        self.zone_clicks = []
        self.zone_poll_timer = QTimer(self)
        self.zone_poll_timer.timeout.connect(self.poll_zone_selection)
        self.paths = []
        self.path_i = 0
        self.point_i = 0
        self.is_drawing = False
        self.is_paused = False
        self.resume_needs_pen_down = False
        self.last_point = None
        self.total_paths = 0
        self.last_whiteboard_url = TARGET_URL

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.draw_tick)
        self.keepalive_timer = QTimer(self)
        self.keepalive_timer.timeout.connect(self.keepalive_tick)
        self.auth_popups = []

        os.makedirs(PROFILE_DIR, exist_ok=True)
        self.profile = QWebEngineProfile("whiteboardfox-autodraw", self)
        self.profile.setPersistentStoragePath(PROFILE_DIR)
        self.profile.setCachePath(os.path.join(PROFILE_DIR, "cache"))
        self.profile.setHttpCacheType(QWebEngineProfile.HttpCacheType.DiskHttpCache)
        self.profile.setHttpCacheMaximumSize(512 * 1024 * 1024)
        self.profile.setPersistentCookiesPolicy(
            QWebEngineProfile.PersistentCookiesPolicy.ForcePersistentCookies
        )
        self.request_filter = RequestFilter(self)
        self.profile.setUrlRequestInterceptor(self.request_filter)

        self.view = BoardView(self)
        self.page = LockedPage(self.profile, self)
        self.view.setPage(self.page)
        self.page.newWindowRequested.connect(self._on_new_window_requested)
        self.page.settings().setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
        self.page.settings().setAttribute(QWebEngineSettings.WebAttribute.JavascriptCanOpenWindows, True)
        self.page.settings().setAttribute(QWebEngineSettings.WebAttribute.JavascriptCanAccessClipboard, True)
        self.page.settings().setAttribute(QWebEngineSettings.WebAttribute.AutoLoadImages, True)
        self.page.settings().setAttribute(QWebEngineSettings.WebAttribute.ScrollAnimatorEnabled, False)
        self.page.settings().setAttribute(QWebEngineSettings.WebAttribute.Accelerated2dCanvasEnabled, True)
        self.page.settings().setAttribute(QWebEngineSettings.WebAttribute.WebGLEnabled, True)
        self.page.settings().setAttribute(QWebEngineSettings.WebAttribute.PlaybackRequiresUserGesture, False)
        self.view.setZoomFactor(0.9)
        self.view.setUrl(QUrl(TARGET_URL))
        self.page.loadFinished.connect(self.install_js_helpers)
        self.page.loadFinished.connect(self._on_load_finished)
        self.view.urlChanged.connect(self._sync_url_bar)

        self._init_ui()
        self._apply_theme()
        self.keepalive_timer.start(25000)

    def _release_auth_popup(self, popup):
        if popup in self.auth_popups:
            self.auth_popups.remove(popup)
        popup.close()

    def create_auth_popup_page(self):
        popup = AuthPopupWindow(self, self.profile)
        self.auth_popups.append(popup)

        def on_popup_url_changed(qurl):
            url_s = qurl.toString() if qurl else ""
            if not url_s or url_s in ("about:blank", "chrome://about", "chrome://about/"):
                return
            host = urlparse(url_s).netloc.lower()
            if is_whiteboardfox_host(host):
                self.view.setUrl(qurl)
                self.set_status(f"Opened in main window: {host}")
                self._release_auth_popup(popup)
                return
            if host.endswith(".firebaseapp.com") and "/__/auth/handler" in urlparse(url_s).path:
                # Keep popup alive here; handler uses opener/postMessage flow and
                # may need more time before redirecting back to WhiteboardFox.
                self.set_status("Waiting for Google auth callback...")
                return

        popup.view.urlChanged.connect(on_popup_url_changed)
        popup.page.windowCloseRequested.connect(lambda: self._release_auth_popup(popup))
        popup.show()
        popup.raise_()
        popup.activateWindow()
        return popup.page

    def _on_new_window_requested(self, request):
        # Route new windows into auth popup so OAuth opener flows work,
        # while still forwarding WhiteboardFox lobbies to the main view.
        url = request.requestedUrl()
        url_s = url.toString() if url else ""
        if url_s in ("", "about:blank", "chrome://about", "chrome://about/"):
            return
        host = urlparse(url_s).netloc.lower()
        if is_allowed_main_frame_url(url_s):
            popup_page = self.create_auth_popup_page()
            try:
                request.openIn(popup_page)
            except Exception:
                popup_page.setUrl(url)
            self.set_status(f"Opening new window flow: {host}")
        else:
            self.set_status(f"Blocked new window to: {host or url_s}")

    def _init_ui(self):
        root = QWidget(self)
        root_layout = QVBoxLayout(root)
        root_layout.setContentsMargins(12, 12, 12, 12)
        root_layout.setSpacing(8)

        title_bar = self._build_title_bar(root)

        controls = QWidget(root)
        controls.setObjectName("controls")
        top_row = QHBoxLayout(controls)
        top_row.setContentsMargins(10, 10, 10, 10)
        top_row.setSpacing(8)

        self.home_btn = QToolButton(controls)
        self.home_btn.setText("Home")
        self.home_btn.clicked.connect(self.go_home)

        self.reload_btn = QToolButton(controls)
        self.reload_btn.setText("Reload")
        self.reload_btn.clicked.connect(self.view.reload)

        self.url_input = QLineEdit(controls)
        self.url_input.setPlaceholderText("Paste WhiteboardFox room URL (or Google login URL)")
        self.url_input.returnPressed.connect(self.open_typed_url)

        self.go_btn = QToolButton(controls)
        self.go_btn.setText("Go")
        self.go_btn.clicked.connect(self.open_typed_url)

        self.perf_btn = QToolButton(controls)
        self.perf_btn.setCheckable(True)
        self.perf_btn.setText("Perf: Normal")
        self.perf_btn.toggled.connect(self.toggle_performance_mode)

        self.lowres_btn = QToolButton(controls)
        self.lowres_btn.setCheckable(True)
        self.lowres_btn.setText("View: Normal")
        self.lowres_btn.toggled.connect(self.toggle_lowres_mode)

        self.keepalive_btn = QToolButton(controls)
        self.keepalive_btn.setCheckable(True)
        self.keepalive_btn.setChecked(True)
        self.keepalive_btn.setText("AFK Guard: On")
        self.keepalive_btn.toggled.connect(self.toggle_keepalive_mode)

        self.reset_session_btn = QToolButton(controls)
        self.reset_session_btn.setText("Reset Session")
        self.reset_session_btn.clicked.connect(self.reset_session)

        self.choose_btn = QPushButton("Choose Image", controls)
        self.choose_btn.clicked.connect(self.choose_image)

        self.zone_btn = QPushButton("Select Draw Area", controls)
        self.zone_btn.clicked.connect(self.begin_zone_select)

        speed_label = QLabel("Speed", controls)
        speed_label.setObjectName("hint")
        self.speed_combo = QComboBox(controls)
        self.speed_combo.addItems(["Slow", "Normal", "Fast", "Very Fast", "Max"])
        self.speed_combo.setCurrentText("Fast")
        self.speed_combo.setMinimumWidth(86)
        self.speed_combo.setMaximumWidth(92)
        self.speed_combo.setToolTip("Drawing speed preset")

        self.start_btn = QPushButton("Start Auto Draw", controls)
        self.start_btn.clicked.connect(self.start_auto_draw)

        self.stop_btn = QPushButton("Stop", controls)
        self.stop_btn.clicked.connect(self.stop_auto_draw)

        self.pause_btn = QPushButton("Pause")
        self.pause_btn.clicked.connect(self.toggle_pause_resume)

        spacer = QWidget(controls)
        spacer.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)

        top_row.addWidget(self.home_btn)
        top_row.addWidget(self.reload_btn)
        top_row.addWidget(self.url_input, 1)
        top_row.addWidget(self.go_btn)
        top_row.addWidget(self.perf_btn)
        top_row.addWidget(self.lowres_btn)
        top_row.addWidget(self.keepalive_btn)
        top_row.addWidget(self.reset_session_btn)
        top_row.addWidget(self.choose_btn)
        top_row.addWidget(self.zone_btn)
        top_row.addWidget(speed_label)
        top_row.addWidget(self.speed_combo)
        top_row.addWidget(spacer)
        top_row.addWidget(self.start_btn)
        top_row.addWidget(self.pause_btn)
        top_row.addWidget(self.stop_btn)

        self.status = QLabel("Ready", root)
        self.status.setObjectName("hint")

        root_layout.addWidget(title_bar)
        root_layout.addWidget(controls)
        root_layout.addWidget(self.view, 1)
        root_layout.addWidget(self.status)
        self.setCentralWidget(root)

    def _build_title_bar(self, parent):
        bar = QFrame(parent)
        bar.setObjectName("title_bar")
        bar.installEventFilter(self)
        layout = QHBoxLayout(bar)
        layout.setContentsMargins(8, 6, 8, 6)
        layout.setSpacing(8)

        title = QLabel("WhiteboardFox Auto Draw", bar)
        title.setObjectName("title_text")
        layout.addWidget(title)
        layout.addStretch(1)

        self._min_btn = QToolButton(bar)
        self._min_btn.setObjectName("window_btn")
        self._min_btn.setText("—")
        self._min_btn.clicked.connect(self.showMinimized)

        self._max_btn = QToolButton(bar)
        self._max_btn.setObjectName("window_btn")
        self._max_btn.setText("▢")
        self._max_btn.clicked.connect(self._toggle_max_restore)

        self._close_btn = QToolButton(bar)
        self._close_btn.setObjectName("window_btn")
        self._close_btn.setText("✕")
        self._close_btn.clicked.connect(self.close)

        layout.addWidget(self._min_btn)
        layout.addWidget(self._max_btn)
        layout.addWidget(self._close_btn)
        return bar

    def _toggle_max_restore(self):
        if self.isMaximized():
            self.showNormal()
        else:
            self.showMaximized()

    def eventFilter(self, obj, event):
        if obj.objectName() == "title_bar":
            if event.type() == QEvent.Type.MouseButtonPress and event.button() == Qt.MouseButton.LeftButton:
                self._drag_pos = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
                return True
            if event.type() == QEvent.Type.MouseMove and self._drag_pos is not None:
                self.move(event.globalPosition().toPoint() - self._drag_pos)
                return True
            if event.type() == QEvent.Type.MouseButtonRelease:
                self._drag_pos = None
                return True
        return super().eventFilter(obj, event)

    def _apply_theme(self):
        self.setStyleSheet(
            """
            QMainWindow {
                background: #0d0d0f;
            }
            QFrame#title_bar, QWidget#controls {
                background: #0f0f14;
                border: 1px solid #20202b;
                border-radius: 10px;
            }
            QLabel#title_text {
                color: #c9c9d6;
                font-size: 12px;
            }
            QToolButton#window_btn {
                background: #1a1a23;
                color: #e9e9ef;
                border: 1px solid #2a2a35;
                border-radius: 8px;
                padding: 4px 8px;
                min-width: 24px;
            }
            QToolButton, QPushButton {
                background: #1a1a23;
                color: #e9e9ef;
                border: 1px solid #2a2a35;
                border-radius: 8px;
                padding: 6px 10px;
            }
            QLineEdit {
                background: #111118;
                color: #e9e9ef;
                border: 1px solid #2a2a35;
                border-radius: 8px;
                padding: 6px 10px;
                selection-background-color: #2f3c7e;
            }
            QToolButton:hover, QPushButton:hover, QToolButton#window_btn:hover {
                background: #232332;
            }
            QToolButton:pressed, QPushButton:pressed, QToolButton#window_btn:pressed {
                background: #0f0f16;
            }
            QSlider::groove:horizontal {
                border: 1px solid #2a2a35;
                height: 8px;
                background: #1f2433;
                border-radius: 4px;
            }
            QSlider::sub-page:horizontal {
                background: #4b78ff;
                border-radius: 4px;
            }
            QSlider::add-page:horizontal {
                background: #2b3144;
                border-radius: 4px;
            }
            QSlider::handle:horizontal {
                background: #e9e9ef;
                border: 1px solid #2a2a35;
                width: 14px;
                margin: -5px 0;
                border-radius: 7px;
            }
            QLabel#hint {
                color: #9a9aaa;
                padding-left: 4px;
                font-size: 12px;
            }
            """
        )

    def set_status(self, text):
        self.status.setText(text)

    def _on_load_finished(self, ok):
        if not ok:
            self.set_status("Page failed to load")
        else:
            self._sync_url_bar(self.view.url())

    def go_home(self):
        self.view.setUrl(QUrl(TARGET_URL))
        self.set_status("Navigated to home")

    def _sync_url_bar(self, qurl):
        url_s = qurl.toString()
        self.url_input.setText(url_s)
        if is_whiteboardfox_host(qurl.host().lower()):
            self.last_whiteboard_url = url_s

    def open_typed_url(self):
        raw = self.url_input.text().strip()
        resolved = normalize_board_url(raw)
        self.view.setUrl(QUrl(resolved))
        if resolved == TARGET_URL and raw and raw != TARGET_URL:
            self.set_status("Invalid/blocked URL. Opened WhiteboardFox home.")
        else:
            self.set_status(f"Opened: {resolved}")

    def toggle_performance_mode(self, enabled):
        self.request_filter.set_fast_mode(enabled)
        self.perf_btn.setText("Perf: Fast" if enabled else "Perf: Normal")
        mode = "FAST" if enabled else "NORMAL"
        self.set_status(f"Performance mode: {mode}")

    def toggle_lowres_mode(self, enabled):
        # Lower zoom reduces pixels to composite in very heavy boards.
        if enabled:
            self.view.setZoomFactor(0.72)
            self.lowres_btn.setText("View: Low-Res")
            self.set_status("Low-Res view enabled for heavy lobbies")
        else:
            self.view.setZoomFactor(0.9)
            self.lowres_btn.setText("View: Normal")
            self.set_status("Normal view enabled")

    def toggle_keepalive_mode(self, enabled):
        self.keepalive_btn.setText("AFK Guard: On" if enabled else "AFK Guard: Off")
        if enabled:
            if not self.keepalive_timer.isActive():
                self.keepalive_timer.start(25000)
            self.set_status("AFK guard enabled")
        else:
            self.keepalive_timer.stop()
            self.set_status("AFK guard disabled")

    def get_speed_interval_ms(self):
        # Lower interval = faster draw ticks.
        name = self.speed_combo.currentText()
        return {
            "Slow": 35,
            "Normal": 18,
            "Fast": 9,
            "Very Fast": 5,
            "Max": 2,
        }.get(name, 9)

    def choose_image(self):
        start_dir = CHROMEBOOK_DOWNLOADS if os.path.isdir(CHROMEBOOK_DOWNLOADS) else os.path.expanduser("~")
        dlg = ImagePickerDialog(start_dir, self)
        if dlg.exec() != QDialog.DialogCode.Accepted or not dlg.selected_path:
            return
        self.image_path = dlg.selected_path
        self.set_status(f"Image: {self.image_path.split('/')[-1]}")

    def begin_zone_select(self):
        self.selecting_zone = True
        self.zone_clicks = []
        self.set_status("Click top-left then bottom-right in the board")
        self.page.runJavaScript(
            """
            (() => {
              window.__wbf_zone_clicks = [];
              if (window.__wbf_zone_handler) {
                document.removeEventListener('click', window.__wbf_zone_handler, true);
              }
              window.__wbf_zone_handler = (e) => {
                window.__wbf_zone_clicks.push([Math.round(e.clientX), Math.round(e.clientY)]);
                e.preventDefault();
                e.stopPropagation();
                if (window.__wbf_zone_clicks.length >= 2) {
                  document.removeEventListener('click', window.__wbf_zone_handler, true);
                }
              };
              document.addEventListener('click', window.__wbf_zone_handler, true);
              return true;
            })();
            """
        )
        self.zone_poll_timer.start(120)

    def poll_zone_selection(self):
        if not self.selecting_zone:
            self.zone_poll_timer.stop()
            return
        self.page.runJavaScript("window.__wbf_zone_clicks || []", self._on_zone_clicks_polled)

    def _on_zone_clicks_polled(self, clicks):
        if not self.selecting_zone:
            return
        if not isinstance(clicks, list):
            return
        if len(clicks) >= 1:
            self.set_status("Now click bottom-right")
        if len(clicks) < 2:
            return
        try:
            x1, y1 = int(clicks[0][0]), int(clicks[0][1])
            x2, y2 = int(clicks[1][0]), int(clicks[1][1])
        except Exception:
            return
        self.zone = DrawZone(x1, y1, x2, y2)
        self.selecting_zone = False
        self.zone_poll_timer.stop()
        self.set_status(f"Zone set: ({x1},{y1}) to ({x2},{y2})")

    def build_paths(self):
        img = cv2.imread(self.image_path)
        if img is None:
            raise RuntimeError("Could not load image.")
        if not self.zone or self.zone.width < 3 or self.zone.height < 3:
            raise RuntimeError("Invalid draw area.")

        resized = cv2.resize(img, (self.zone.width, self.zone.height))
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 100, 200)
        contours, _ = cv2.findContours(edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

        out = []
        for c in contours:
            pts = c.reshape(-1, 2)
            if len(pts) < 2:
                continue
            path = []
            for x, y in pts:
                path.append((int(x + self.zone.left), int(y + self.zone.top)))
            out.append(path)
        return out

    def start_auto_draw(self):
        if self.is_drawing:
            return
        if not self.image_path:
            QMessageBox.warning(self, "Missing Image", "Choose an image first.")
            return
        if not self.zone:
            QMessageBox.warning(self, "Missing Area", "Select draw area first.")
            return
        try:
            self.paths = self.build_paths()
        except Exception as exc:
            QMessageBox.critical(self, "Auto Draw Error", str(exc))
            return

        if not self.paths:
            QMessageBox.warning(self, "No Edges", "Could not detect drawable edges.")
            return

        self.path_i = 0
        self.point_i = 0
        self.total_paths = len(self.paths)
        self.is_drawing = True
        self.is_paused = False
        self.resume_needs_pen_down = False
        self.pause_btn.setText("Pause")
        self.page.runJavaScript("window.__wbf_lockInput && window.__wbf_lockInput();")
        interval_ms = self.get_speed_interval_ms()
        self.timer.start(interval_ms)
        self.view.setFocus()
        self.set_status(f"Auto drawing... 0/{self.total_paths}")

    def stop_auto_draw(self):
        self.timer.stop()
        if self.is_drawing and self.last_point:
            self.emit_board_event("mouseup", self.last_point[0], self.last_point[1], False)
        self.is_drawing = False
        self.is_paused = False
        self.resume_needs_pen_down = False
        self.pause_btn.setText("Pause")
        self.last_point = None
        self.total_paths = 0
        self.page.runJavaScript("window.__wbf_unlockInput && window.__wbf_unlockInput();")
        self.set_status("Stopped (drawing cancelled)")

    def pause_auto_draw(self):
        if not self.is_drawing or self.is_paused:
            return
        if self.last_point:
            self.emit_board_event("mouseup", self.last_point[0], self.last_point[1], False)
            if self.point_i > 0:
                self.resume_needs_pen_down = True
        self.is_paused = True
        self.pause_btn.setText("Resume")
        self.set_status("Auto draw paused")

    def resume_auto_draw(self):
        if not self.is_drawing or not self.is_paused:
            return
        self.is_paused = False
        self.pause_btn.setText("Pause")
        self.set_status("Auto draw resumed")

    def toggle_pause_resume(self):
        if not self.is_drawing:
            self.set_status("Start auto draw first")
            return
        if self.is_paused:
            self.resume_auto_draw()
        else:
            self.pause_auto_draw()

    def install_js_helpers(self, _ok):
        self.page.runJavaScript(
            """
            (() => {
              window.__wbf_lockInput = () => {
                if (document.getElementById('__wbf_input_lock')) return true;
                const lock = document.createElement('div');
                lock.id = '__wbf_input_lock';
                lock.style.position = 'fixed';
                lock.style.inset = '0';
                lock.style.zIndex = '2147483647';
                lock.style.background = 'transparent';
                lock.style.cursor = 'not-allowed';
                lock.style.pointerEvents = 'auto';
                lock.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); }, true);
                lock.addEventListener('mouseup', e => { e.preventDefault(); e.stopPropagation(); }, true);
                lock.addEventListener('mousemove', e => { e.preventDefault(); e.stopPropagation(); }, true);
                lock.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); }, true);
                lock.addEventListener('pointermove', e => { e.preventDefault(); e.stopPropagation(); }, true);
                lock.addEventListener('pointerup', e => { e.preventDefault(); e.stopPropagation(); }, true);
                lock.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); }, true);
                document.body.appendChild(lock);
                return true;
              };
              window.__wbf_unlockInput = () => {
                const lock = document.getElementById('__wbf_input_lock');
                if (lock) lock.remove();
                return true;
              };
              window.__wbf_fire = (type, x, y, down) => {
                const c = [...document.querySelectorAll('canvas')].find(el => el.width > 300);
                if (!c) return false;
                c.dispatchEvent(new MouseEvent(type, {
                  bubbles: true,
                  clientX: x,
                  clientY: y,
                  buttons: down ? 1 : 0
                }));
                return true;
              };
              return true;
            })();
            """
        )

    def emit_board_event(self, ev_type, x, y, down):
        x = float(x)
        y = float(y)
        down_js = "true" if down else "false"
        self.page.runJavaScript(f"window.__wbf_fire && window.__wbf_fire('{ev_type}', {x:.2f}, {y:.2f}, {down_js});")

    def draw_tick(self):
        if not self.is_drawing:
            self.timer.stop()
            return
        if self.is_paused:
            return
        if self.path_i >= len(self.paths):
            self.timer.stop()
            self.is_drawing = False
            self.page.runJavaScript("window.__wbf_unlockInput && window.__wbf_unlockInput();")
            self.set_status(f"Auto draw complete ({self.total_paths}/{self.total_paths})")
            self.total_paths = 0
            return

        path = self.paths[self.path_i]
        if self.resume_needs_pen_down and self.point_i > 0:
            px, py = path[self.point_i - 1]
            self.emit_board_event("mousemove", px, py, False)
            self.emit_board_event("mousedown", px, py, True)
            self.last_point = (px, py)
            self.resume_needs_pen_down = False
            return
        if self.point_i == 0:
            x, y = path[0]
            self.emit_board_event("mousemove", x, y, False)
            self.emit_board_event("mousedown", x, y, True)
            self.last_point = (x, y)
            self.point_i = 1
            return

        if self.point_i < len(path):
            x, y = path[self.point_i]
            self.emit_board_event("mousemove", x, y, True)
            self.last_point = (x, y)
            self.point_i += 1
            return

        self.emit_board_event("mouseup", path[-1][0], path[-1][1], False)
        self.path_i += 1
        self.point_i = 0
        self.set_status(f"Auto drawing... {self.path_i}/{self.total_paths}")

    def keepalive_tick(self):
        if not self.keepalive_btn.isChecked():
            return
        host = self.view.url().host().lower()
        if not is_whiteboardfox_host(host):
            return
        was_paused = self.is_paused
        if self.is_drawing and not was_paused:
            # Pause active stroke before keepalive ping to avoid stray lines.
            self.pause_auto_draw()
        # Send a lightweight click + key pulse as keepalive.
        self.page.runJavaScript(
            """
            (() => {
              let ping = document.getElementById('__wbf_keepalive_ping');
              if (!ping) {
                ping = document.createElement('button');
                ping.id = '__wbf_keepalive_ping';
                ping.type = 'button';
                ping.tabIndex = -1;
                ping.style.position = 'fixed';
                ping.style.left = '-9999px';
                ping.style.top = '-9999px';
                ping.style.width = '1px';
                ping.style.height = '1px';
                ping.style.opacity = '0';
                ping.style.pointerEvents = 'none';
                document.body.appendChild(ping);
              }
              ping.click();
              document.dispatchEvent(new KeyboardEvent('keydown', {bubbles:true, key:'Shift'}));
              document.dispatchEvent(new KeyboardEvent('keyup', {bubbles:true, key:'Shift'}));
              window.dispatchEvent(new Event('focus'));
              return true;
            })();
            """
        )
        if self.is_drawing and not was_paused:
            self.resume_auto_draw()

    def reset_session(self):
        reply = QMessageBox.question(
            self,
            "Reset Session",
            "Clear browser cookies/cache for this app and reload WhiteboardFox?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )
        if reply != QMessageBox.StandardButton.Yes:
            return
        try:
            self.profile.cookieStore().deleteAllCookies()
            self.profile.clearHttpCache()
        except Exception:
            pass
        self.page.runJavaScript(
            """
            (() => {
              try { localStorage.clear(); } catch (e) {}
              try { sessionStorage.clear(); } catch (e) {}
              return true;
            })();
            """
        )
        self.view.setUrl(QUrl(TARGET_URL))
        self.set_status("Session reset. Sign in again if needed.")

    def closeEvent(self, event):
        for p in list(self.auth_popups):
            self._release_auth_popup(p)
        self.view.setPage(None)
        self.page.deleteLater()
        self.profile.deleteLater()
        super().closeEvent(event)


def main():
    app = QApplication(sys.argv)
    win = MainWindow()
    win.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
