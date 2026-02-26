import os
import sys
import time
from urllib.parse import quote_plus

# Force X11 on Chromebooks and allow tuning Chromium flags.
os.environ.setdefault("QT_QPA_PLATFORM", "xcb")
if os.environ.get("YTMUSIC_DISABLE_GPU") == "1":
    os.environ.setdefault("QTWEBENGINE_CHROMIUM_FLAGS", "--disable-gpu --disable-software-rasterizer")
else:
    default_flags = [
        "--ignore-gpu-blocklist",
        "--enable-gpu-rasterization",
        "--enable-zero-copy",
        "--disable-features=UseOzonePlatform",
    ]
    existing = os.environ.get("QTWEBENGINE_CHROMIUM_FLAGS", "")
    os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = (existing + " " + " ".join(default_flags)).strip()

from PySide6.QtCore import QUrl, Qt, QStandardPaths, QPoint, QEvent, QTimer
from PySide6.QtGui import QAction, QKeySequence
from PySide6.QtWidgets import (
    QApplication,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSizePolicy,
    QToolButton,
    QVBoxLayout,
    QWidget,
)
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWebEngineCore import QWebEngineProfile, QWebEngineSettings, QWebEngineUrlRequestInterceptor


APP_NAME = "YT Music Desktop"
HOME_URL = "https://music.youtube.com/"
PERF_MODE = os.environ.get("YTMUSIC_PERF") == "1"
AUDIO_ONLY = os.environ.get("YTMUSIC_AUDIO_ONLY") == "1"
HIDE_SITE_SEARCH = True
BLOCK_SIGNIN = True


class SignInBlocker(QWebEngineUrlRequestInterceptor):
    def interceptRequest(self, info):
        if not BLOCK_SIGNIN:
            return
        url = info.requestUrl().toString().lower()
        blocked = [
            "accounts.google.com",
            "myaccount.google.com",
            "accounts.youtube.com",
            "accounts.googleusercontent.com",
            "youtube.com/signin",
            "music.youtube.com/signin",
        ]
        if any(b in url for b in blocked):
            info.block(True)


def _app_data_dir():
    base = QStandardPaths.writableLocation(QStandardPaths.AppDataLocation)
    path = os.path.join(base, "ytmusic_app")
    os.makedirs(path, exist_ok=True)
    return path


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(APP_NAME)
        self.setWindowFlags(self.windowFlags() | Qt.FramelessWindowHint)
        self.resize(1200, 800)

        self._last_block_notice = 0
        self._drag_pos = None
        self._init_webview()
        self._init_ui()
        self._init_shortcuts()

        self.webview.loadFinished.connect(self._on_load_finished)
        self.webview.setUrl(QUrl(HOME_URL))

    def _init_webview(self):
        data_dir = _app_data_dir()
        profile = QWebEngineProfile.defaultProfile()
        profile.setPersistentStoragePath(os.path.join(data_dir, "web_profile"))
        profile.setPersistentCookiesPolicy(QWebEngineProfile.ForcePersistentCookies)
        self._signin_blocker = SignInBlocker()
        profile.setUrlRequestInterceptor(self._signin_blocker)

        self.webview = QWebEngineView(self)
        settings = self.webview.settings()
        settings.setAttribute(QWebEngineSettings.PlaybackRequiresUserGesture, False)
        settings.setAttribute(QWebEngineSettings.LocalStorageEnabled, True)
        settings.setAttribute(QWebEngineSettings.JavascriptEnabled, True)
        settings.setAttribute(QWebEngineSettings.DnsPrefetchEnabled, True)
        self.webview.urlChanged.connect(self._guard_signin)

    def _init_ui(self):
        root = QWidget(self)
        root_layout = QVBoxLayout(root)
        root_layout.setContentsMargins(12, 12, 12, 12)
        root_layout.setSpacing(8)

        title_bar = self._build_title_bar(root)

        top_bar = QWidget(root)
        top_layout = QHBoxLayout(top_bar)
        top_layout.setContentsMargins(8, 8, 8, 8)
        top_layout.setSpacing(8)

        self.back_btn = QToolButton(top_bar)
        self.back_btn.setText("◀")
        self.back_btn.setToolTip("Back")
        self.back_btn.clicked.connect(self.webview.back)

        self.forward_btn = QToolButton(top_bar)
        self.forward_btn.setText("▶")
        self.forward_btn.setToolTip("Forward")
        self.forward_btn.clicked.connect(self.webview.forward)

        self.reload_btn = QToolButton(top_bar)
        self.reload_btn.setText("↻")
        self.reload_btn.setToolTip("Reload")
        self.reload_btn.clicked.connect(self.webview.reload)

        self.search_input = QLineEdit(top_bar)
        self.search_input.setPlaceholderText("Search YouTube Music")
        self.search_input.returnPressed.connect(self.on_search)

        self.search_btn = QPushButton("Search", top_bar)
        self.search_btn.clicked.connect(self.on_search)

        spacer = QWidget(top_bar)
        spacer.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)

        self.play_btn = QToolButton(top_bar)
        self.play_btn.setText("⏯")
        self.play_btn.setToolTip("Play / Pause")
        self.play_btn.clicked.connect(self.js_toggle_play)

        self.prev_btn = QToolButton(top_bar)
        self.prev_btn.setText("⏮")
        self.prev_btn.setToolTip("Previous")
        self.prev_btn.clicked.connect(self.js_prev)

        self.next_btn = QToolButton(top_bar)
        self.next_btn.setText("⏭")
        self.next_btn.setToolTip("Next")
        self.next_btn.clicked.connect(self.js_next)

        self.home_btn = QToolButton(top_bar)
        self.home_btn.setText("🏠")
        self.home_btn.setToolTip("Home")
        self.home_btn.clicked.connect(self.go_home)

        top_layout.addWidget(self.back_btn)
        top_layout.addWidget(self.forward_btn)
        top_layout.addWidget(self.reload_btn)
        top_layout.addWidget(self.search_input, 1)
        top_layout.addWidget(self.search_btn)
        top_layout.addWidget(spacer)
        top_layout.addWidget(self.play_btn)
        top_layout.addWidget(self.prev_btn)
        top_layout.addWidget(self.next_btn)
        top_layout.addWidget(self.home_btn)

        hint = QLabel(
            "Tip: Use the controls or click inside the player.",
            root,
        )
        hint.setObjectName("hint")

        root_layout.addWidget(title_bar)
        root_layout.addWidget(top_bar)
        root_layout.addWidget(hint)
        root_layout.addWidget(self.webview, 1)

        self.setCentralWidget(root)
        self._apply_theme()

    def _apply_theme(self):
        self.setStyleSheet(
            """
            QMainWindow {
                background: #0d0d0f;
            }
            QFrame#title_bar {
                background: #0f0f14;
                border: 1px solid #20202b;
                border-radius: 10px;
            }
            QToolButton#window_btn {
                background: #1a1a23;
                color: #e9e9ef;
                border: 1px solid #2a2a35;
                border-radius: 8px;
                padding: 4px 8px;
                min-width: 26px;
            }
            QToolButton#window_btn:hover {
                background: #232332;
            }
            QToolButton#window_btn:pressed {
                background: #0f0f16;
            }
            QLineEdit {
                background: #14141a;
                color: #e9e9ef;
                border: 1px solid #2a2a35;
                border-radius: 8px;
                padding: 8px 10px;
                font-size: 14px;
            }
            QToolButton, QPushButton {
                background: #1a1a23;
                color: #e9e9ef;
                border: 1px solid #2a2a35;
                border-radius: 8px;
                padding: 6px 10px;
            }
            QToolButton:hover, QPushButton:hover {
                background: #232332;
            }
            QToolButton:pressed, QPushButton:pressed {
                background: #0f0f16;
            }
            QLabel#hint {
                color: #9a9aaa;
                padding-left: 4px;
                font-size: 12px;
            }
            """
        )

    def _build_title_bar(self, parent):
        bar = QFrame(parent)
        bar.setObjectName("title_bar")
        bar.installEventFilter(self)
        bar.setMouseTracking(True)
        layout = QHBoxLayout(bar)
        layout.setContentsMargins(8, 6, 8, 6)
        layout.setSpacing(8)

        self._title_label = QLabel(APP_NAME, bar)
        self._title_label.setStyleSheet("color: #c9c9d6; font-size: 12px;")

        layout.addWidget(self._title_label)
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
            if event.type() == QEvent.Type.MouseButtonDblClick:
                self._toggle_max_restore()
                return True
            if event.type() == QEvent.Type.MouseButtonPress and event.button() == Qt.LeftButton:
                self._drag_pos = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
                return True
            if event.type() == QEvent.Type.MouseMove and event.buttons() == Qt.LeftButton and self._drag_pos:
                self.move(event.globalPosition().toPoint() - self._drag_pos)
                return True
            if event.type() == QEvent.Type.MouseButtonRelease:
                self._drag_pos = None
                return True
        return super().eventFilter(obj, event)

    def changeEvent(self, event):
        if event.type() == QEvent.Type.WindowStateChange:
            if not self.isMinimized():
                QTimer.singleShot(200, self._refresh_webview)
        super().changeEvent(event)

    def _refresh_webview(self):
        # Fix occasional black screen after minimize/restore on X11.
        self.webview.page().runJavaScript("window.dispatchEvent(new Event('resize'));")
        self.webview.update()

    def _init_shortcuts(self):
        play_pause = QAction(self)
        play_pause.setShortcut(QKeySequence("Space"))
        play_pause.triggered.connect(self.js_toggle_play)
        self.addAction(play_pause)

        next_track = QAction(self)
        next_track.setShortcut(QKeySequence("Ctrl+Right"))
        next_track.triggered.connect(self.js_next)
        self.addAction(next_track)

        prev_track = QAction(self)
        prev_track.setShortcut(QKeySequence("Ctrl+Left"))
        prev_track.triggered.connect(self.js_prev)
        self.addAction(prev_track)

        focus_search = QAction(self)
        focus_search.setShortcut(QKeySequence("Ctrl+K"))
        focus_search.triggered.connect(self.search_input.setFocus)
        self.addAction(focus_search)

    def go_home(self):
        self.webview.setUrl(QUrl(HOME_URL))

    def on_search(self):
        query = self.search_input.text().strip()
        if not query:
            return
        url = f"https://music.youtube.com/search?q={quote_plus(query)}"
        self.webview.setUrl(QUrl(url))

    def _run_js(self, js):
        self.webview.page().runJavaScript(js)

    def _on_load_finished(self, ok):
        if not ok:
            return
        if PERF_MODE:
            js = """
            (function(){
                const style = document.createElement('style');
                style.textContent = `
                    * { animation: none !important; transition: none !important; }
                    ytmusic-player-queue { display: none !important; }
                    #guide-wrapper, ytmusic-guide-entry-renderer { display: none !important; }
                    ytmusic-app-layout #content { margin-left: 0 !important; }
                `;
                document.head.appendChild(style);
                document.documentElement.style.scrollBehavior = 'auto';
            })();
            """
            self._run_js(js)
        if HIDE_SITE_SEARCH:
            self._run_js(self._hide_site_search_js())
        if AUDIO_ONLY:
            self._run_js(self._audio_only_js())
        self._run_js(self._hide_signin_and_promo_js())

    def _guard_signin(self, url):
        if not BLOCK_SIGNIN:
            return
        target = url.toString().lower()
        blocked = [
            "accounts.google.com",
            "myaccount.google.com",
            "accounts.youtube.com",
            "accounts.googleusercontent.com",
            "youtube.com/signin",
            "music.youtube.com/signin",
        ]
        if any(b in target for b in blocked):
            now_ms = int(time.time() * 1000)
            if now_ms - self._last_block_notice > 1500:
                self._last_block_notice = now_ms
                QMessageBox.warning(
                    self,
                    "Sign-in blocked",
                    "Sign-in is disabled in this app.",
                )
            self.webview.setUrl(QUrl(HOME_URL))

    def _hide_site_search_js(self):
        return """
        (function(){
            const style = document.createElement('style');
            style.textContent = `
                ytmusic-search-box, #search-box, #search-container { display: none !important; }
                ytmusic-nav-bar #center { justify-content: center !important; }
            `;
            document.head.appendChild(style);
        })();
        """

    def _hide_signin_and_promo_js(self):
        return """
        (function(){
            const style = document.createElement('style');
            style.textContent = `
                a[href*="accounts.google.com"], ytmusic-sign-in-button,
                ytmusic-upsell, ytmusic-premium-promo, ytmusic-promo, .ytmusic-promo,
                tp-yt-paper-dialog ytmusic-promo-renderer,
                ytmusic-promo-renderer, ytmusic-dialog-renderer { display: none !important; }
            `;
            document.head.appendChild(style);
        })();
        """

    def _audio_only_js(self):
        return """
        (function(){
            const clickIf = (sel) => {
                const el = document.querySelector(sel);
                if (el) { el.click(); return true; }
                return false;
            };
            const tryAudioMode = () => {
                // Try common Song/Video toggle selectors.
                if (clickIf('button[aria-label="Song"]')) return;
                if (clickIf('tp-yt-paper-tab[aria-label="Song"]')) return;
                if (clickIf('button[aria-label="Audio"]')) return;
            };
            tryAudioMode();
            setTimeout(tryAudioMode, 800);
            setTimeout(tryAudioMode, 2000);
        })();
        """

    def js_toggle_play(self):
        js = """
        (function(){
            const selectors = [
                'button[aria-label="Pause"]',
                'button[aria-label="Play"]',
                'tp-yt-paper-icon-button[title="Pause"] button',
                'tp-yt-paper-icon-button[title="Play"] button'
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) { el.click(); return; }
            }
        })();
        """
        self._run_js(js)

    def js_next(self):
        js = """
        (function(){
            const selectors = [
                'button[aria-label="Next song"]',
                'tp-yt-paper-icon-button[title="Next"] button'
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) { el.click(); return; }
            }
        })();
        """
        self._run_js(js)

    def js_prev(self):
        js = """
        (function(){
            const selectors = [
                'button[aria-label="Previous song"]',
                'tp-yt-paper-icon-button[title="Previous"] button'
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) { el.click(); return; }
            }
        })();
        """
        self._run_js(js)


def main():
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)

    window = MainWindow()
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
