"""
WIN7 PAINT REMAKE (Tkinter) with Auto Draw + App Rating
"""

import json
import math
import os
import random
import threading
import time
import tkinter as tk
from tkinter import colorchooser, filedialog, messagebox, scrolledtext, simpledialog

import cv2
import numpy as np
import requests
from PIL import Image, ImageDraw, ImageFont, ImageTk, ImageOps


class Win95Paint:
    def __init__(self, root):
        self.root = root
        self.root.title("untitled - Paint")
        self.root.geometry("1200x900")
        self.root.configure(bg="#c0c0c0")

        # Identity & settings
        self.settings_file = "user_settings.json"
        self.username = self.load_username()
        self.webhook_url = self.load_webhook()

        # State
        self.active_tool = "pencil"
        self.primary_color = "#000000"
        self.secondary_color = "#ffffff"
        self.brush_size = 2
        self.brush_type = "round"
        self.is_drawing_auto = False
        self.img_path = None
        self.draw_zone = None
        self.selection_rect = None
        self.selection_preview_id = None
        self.selection_preview_tk = None
        self.selection_active = False
        self.selection_mode = "rect"  # rect | free
        self.selection_points = []
        self.selection_bbox = None
        self.selection_image = None
        self.selection_mask = None
        self.selection_dragging = False
        self.selection_offset = (0, 0)
        self.selection_cleared = False
        self.rating = 0
        self.attach_image_var = None
        self.drag_preview = None
        self.drag_points = None
        self.temp_draw_ids = []
        self.zoom = 1.0
        self.zoom_levels = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0]
        self.shape_fill_mode = "outline"  # outline | fill | both
        self.font_family = "Arial"
        self.font_size = 20
        self.font_bold = False
        self.font_italic = False
        self.clipboard_image = None
        self.clipboard_mask = None
        self.last_redraw_time = 0.0

        # Canvas image
        self.canvas_width = 1600
        self.canvas_height = 1000
        self.image = Image.new("RGB", (self.canvas_width, self.canvas_height), "white")
        self.draw = ImageDraw.Draw(self.image)
        self.undo_stack = []
        self.redo_stack = []

        # Paths
        self.chrome_path = "/mnt/chromeos/MyFiles/Downloads"
        self.linux_path = os.path.expanduser("~")

        if not self.username:
            self.ask_for_username()
        else:
            self.setup_ui()

    def load_username(self):
        if os.path.exists(self.settings_file):
            try:
                with open(self.settings_file, "r") as f:
                    return json.load(f).get("username", None)
            except Exception:
                return None
        return None

    def config_dir(self):
        return os.path.join(os.path.expanduser("~"), ".config", "win7-paint-remake")

    def config_file(self):
        return os.path.join(self.config_dir(), "config.json")

    def load_webhook(self):
        env = os.environ.get("PAINT_WEBHOOK_URL", "").strip()
        if env:
            self.save_webhook(env)
            return env
        path = self.config_file()
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    return json.load(f).get("webhook_url", "").strip()
            except Exception:
                return ""
        return ""

    def save_webhook(self, url):
        url = (url or "").strip()
        if not url:
            return
        os.makedirs(self.config_dir(), exist_ok=True)
        with open(self.config_file(), "w") as f:
            json.dump({"webhook_url": url}, f)
        self.webhook_url = url

    def ask_for_username(self):
        self.user_win = tk.Toplevel(self.root)
        self.user_win.title("Welcome")
        self.user_win.geometry("300x150")
        self.user_win.configure(bg="#c0c0c0")
        self.user_win.grab_set()
        tk.Label(self.user_win, text="Please enter a username:", bg="#c0c0c0").pack(pady=10)
        self.u_entry = tk.Entry(self.user_win)
        self.u_entry.pack(pady=5)

        def confirm():
            name = self.u_entry.get().strip()
            if name:
                with open(self.settings_file, "w") as f:
                    json.dump({"username": name}, f)
                self.username = name
                self.user_win.destroy()
                self.setup_ui()
            else:
                messagebox.showwarning("Error", "Username cannot be empty!")

        tk.Button(self.user_win, text="Login", width=10, command=confirm).pack(pady=10)

    def setup_ui(self):
        self.build_menu()

        self.canvas_frame = tk.Frame(self.root, bg="#808080", bd=3, relief="sunken")
        self.canvas_frame.pack(expand=True, fill="both", padx=5, pady=5)

        self.h_scroll = tk.Scrollbar(self.canvas_frame, orient="horizontal")
        self.h_scroll.pack(side="bottom", fill="x")
        self.v_scroll = tk.Scrollbar(self.canvas_frame, orient="vertical")
        self.v_scroll.pack(side="right", fill="y")

        self.canvas = tk.Canvas(
            self.canvas_frame,
            bg="white",
            width=900,
            height=650,
            scrollregion=(0, 0, int(self.canvas_width * self.zoom), int(self.canvas_height * self.zoom)),
            xscrollcommand=self.h_scroll.set,
            yscrollcommand=self.v_scroll.set,
            highlightthickness=0,
        )
        self.canvas.pack(expand=True, fill="both")
        self.h_scroll.config(command=self.canvas.xview)
        self.v_scroll.config(command=self.canvas.yview)

        self.display_image = None
        self.display_image_id = None
        self.redraw_canvas(force=True)

        self.canvas.bind("<Button-1>", self.on_click)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        self.canvas.bind("<Button-3>", self.on_right_click)
        self.canvas.bind("<Motion>", self.on_motion)

        self.status = tk.Frame(self.root, bg="#c0c0c0", bd=2, relief="sunken")
        self.status.pack(side="bottom", fill="x")
        self.coord_label = tk.Label(self.status, text="X: 0  Y: 0", bg="#c0c0c0", anchor="w")
        self.coord_label.pack(side="left", padx=6)
        self.zoom_label = tk.Label(self.status, text="100%", bg="#c0c0c0", anchor="e")
        self.zoom_label.pack(side="right", padx=6)

    def build_menu(self):
        menubar = tk.Menu(self.root)

        file_menu = tk.Menu(menubar, tearoff=0)
        file_menu.add_command(label="New", command=self.new_file)
        file_menu.add_command(label="Open...", command=self.open_file)
        file_menu.add_command(label="Save", command=self.save_file)
        file_menu.add_command(label="Save As...", command=lambda: self.save_file(save_as=True))
        file_menu.add_separator()
        file_menu.add_command(label="Exit", command=self.root.destroy)
        menubar.add_cascade(label="File", menu=file_menu)

        edit_menu = tk.Menu(menubar, tearoff=0)
        edit_menu.add_command(label="Undo", command=self.undo)
        edit_menu.add_command(label="Redo", command=self.redo)
        edit_menu.add_separator()
        edit_menu.add_command(label="Cut", command=self.cut_selection)
        edit_menu.add_command(label="Copy", command=self.copy_selection)
        edit_menu.add_command(label="Paste", command=self.paste_clipboard)
        edit_menu.add_separator()
        edit_menu.add_command(label="Clear", command=self.clear_canvas)
        menubar.add_cascade(label="Edit", menu=edit_menu)

        image_menu = tk.Menu(menubar, tearoff=0)
        image_menu.add_command(label="Select (Rect)", command=lambda: self.set_selection_mode("rect"))
        image_menu.add_command(label="Select (Freeform)", command=lambda: self.set_selection_mode("free"))
        image_menu.add_separator()
        image_menu.add_command(label="Crop", command=self.crop_to_selection)
        image_menu.add_command(label="Resize / Skew", command=self.resize_dialog)
        image_menu.add_command(label="Rotate / Flip", command=self.rotate_menu)
        menubar.add_cascade(label="Image", menu=image_menu)

        colors_menu = tk.Menu(menubar, tearoff=0)
        colors_menu.add_command(label="Pick Color 1...", command=self.pick_color_dialog_primary)
        colors_menu.add_command(label="Pick Color 2...", command=self.pick_color_dialog_secondary)
        menubar.add_cascade(label="Colors", menu=colors_menu)

        tools_menu = tk.Menu(menubar, tearoff=0)
        tools_menu.add_command(label="Pencil", command=lambda: self.set_tool("pencil"))
        tools_menu.add_command(label="Brush", command=lambda: self.set_tool("brush"))
        tools_menu.add_command(label="Eraser", command=lambda: self.set_tool("eraser"))
        tools_menu.add_command(label="Fill", command=lambda: self.set_tool("fill"))
        tools_menu.add_command(label="Text", command=lambda: self.set_tool("text"))
        tools_menu.add_command(label="Picker", command=lambda: self.set_tool("picker"))
        tools_menu.add_command(label="Pan", command=lambda: self.set_tool("pan"))
        tools_menu.add_separator()
        tools_menu.add_command(label="Line", command=lambda: self.set_tool("line"))
        tools_menu.add_command(label="Rectangle", command=lambda: self.set_tool("rect"))
        tools_menu.add_command(label="Ellipse", command=lambda: self.set_tool("ellipse"))
        tools_menu.add_separator()
        tools_menu.add_command(label="Select (Rect)", command=lambda: self.set_selection_mode("rect"))
        tools_menu.add_command(label="Select (Freeform)", command=lambda: self.set_selection_mode("free"))
        tools_menu.add_separator()
        brushes_menu = tk.Menu(tools_menu, tearoff=0)
        self.brush_var = tk.StringVar(value=self.brush_type)
        for b in ["round", "square", "airbrush", "calligraphy", "marker"]:
            brushes_menu.add_radiobutton(label=b, value=b, variable=self.brush_var, command=lambda: self.set_brush(self.brush_var.get()))
        tools_menu.add_cascade(label="Brush Type", menu=brushes_menu)
        fill_menu = tk.Menu(tools_menu, tearoff=0)
        self.fill_var = tk.StringVar(value=self.shape_fill_mode)
        for m in ["outline", "fill", "both"]:
            fill_menu.add_radiobutton(label=m, value=m, variable=self.fill_var, command=lambda: self.set_shape_fill(self.fill_var.get()))
        tools_menu.add_cascade(label="Shape Fill", menu=fill_menu)
        tools_menu.add_separator()
        tools_menu.add_command(label="Brush Size...", command=self.size_dialog)
        tools_menu.add_command(label="Text Settings...", command=self.text_settings_dialog)
        menubar.add_cascade(label="Tools", menu=tools_menu)

        view_menu = tk.Menu(menubar, tearoff=0)
        view_menu.add_command(label="Open File Manager", command=self.open_custom_browser)
        view_menu.add_command(label="Auto Draw Settings", command=self.open_auto_draw_window)
        view_menu.add_separator()
        view_menu.add_command(label="Zoom In", command=lambda: self.set_zoom(self.zoom * 1.25))
        view_menu.add_command(label="Zoom Out", command=lambda: self.set_zoom(self.zoom / 1.25))
        view_menu.add_command(label="100%", command=lambda: self.set_zoom(1.0))
        menubar.add_cascade(label="View", menu=view_menu)

        help_menu = tk.Menu(menubar, tearoff=0)
        help_menu.add_command(label="Set Webhook...", command=self.set_webhook_dialog)
        help_menu.add_command(label="Rate App", command=self.open_rating_window)
        help_menu.add_command(label="About", command=lambda: messagebox.showinfo("About", "Win7 Paint Remake"))
        menubar.add_cascade(label="Help", menu=help_menu)

        self.root.config(menu=menubar)

    def set_zoom(self, value):
        value = max(0.25, min(4.0, float(value)))
        self.zoom = value
        if hasattr(self, "zoom_scale"):
            self.zoom_scale.set(int(self.zoom * 100))
        self.zoom_label.config(text=f"{int(self.zoom * 100)}%")
        self.redraw_canvas(force=True)

    def on_zoom_scale(self, val):
        try:
            self.set_zoom(float(val) / 100.0)
        except Exception:
            pass

    def set_primary(self, color):
        self.primary_color = color
        if hasattr(self, "color1_box"):
            self.color1_box.config(bg=color)

    def set_secondary(self, color):
        self.secondary_color = color
        if hasattr(self, "color2_box"):
            self.color2_box.config(bg=color)

    def pick_color_dialog_primary(self):
        c = colorchooser.askcolor(color=self.primary_color, title="Pick Color 1")
        if c and c[1]:
            self.set_primary(c[1])

    def pick_color_dialog_secondary(self):
        c = colorchooser.askcolor(color=self.secondary_color, title="Pick Color 2")
        if c and c[1]:
            self.set_secondary(c[1])

    def set_tool(self, tool):
        self.active_tool = tool
        cursor = "cross"
        if tool == "pan":
            cursor = "fleur"
        elif tool == "text":
            cursor = "xterm"
        self.canvas.config(cursor=cursor)
        self.clear_temp_draw()

    def clear_temp_draw(self):
        if self.temp_draw_ids:
            for item in self.temp_draw_ids:
                try:
                    self.canvas.delete(item)
                except Exception:
                    pass
            self.temp_draw_ids.clear()

    def set_brush(self, brush):
        self.brush_type = brush

    def set_shape_fill(self, mode):
        self.shape_fill_mode = mode

    def set_selection_mode(self, mode):
        self.selection_mode = mode
        self.set_tool("select")

    def size_dialog(self):
        win = tk.Toplevel(self.root)
        win.title("Brush Size")
        win.geometry("220x140")
        win.configure(bg="#c0c0c0")
        tk.Label(win, text="Size (1-40)", bg="#c0c0c0").pack(pady=6)
        size_var = tk.IntVar(value=self.brush_size)
        tk.Spinbox(win, from_=1, to=40, textvariable=size_var, width=8).pack(pady=4)

        def apply():
            try:
                val = int(size_var.get())
                self.brush_size = max(1, min(40, val))
                win.destroy()
            except Exception:
                messagebox.showerror("Error", "Invalid size")

        tk.Button(win, text="Apply", command=apply).pack(pady=8)

    def text_settings_dialog(self):
        win = tk.Toplevel(self.root)
        win.title("Text Settings")
        win.geometry("260x220")
        win.configure(bg="#c0c0c0")
        tk.Label(win, text="Font", bg="#c0c0c0").pack(pady=4)
        font_var = tk.StringVar(value=self.font_family)
        tk.Entry(win, textvariable=font_var, width=18).pack()
        tk.Label(win, text="Size", bg="#c0c0c0").pack(pady=4)
        size_var = tk.IntVar(value=self.font_size)
        tk.Spinbox(win, from_=8, to=96, textvariable=size_var, width=8).pack()
        bold_var = tk.BooleanVar(value=self.font_bold)
        italic_var = tk.BooleanVar(value=self.font_italic)
        tk.Checkbutton(win, text="Bold", variable=bold_var, bg="#c0c0c0").pack(anchor="w", padx=10)
        tk.Checkbutton(win, text="Italic", variable=italic_var, bg="#c0c0c0").pack(anchor="w", padx=10)

        def apply():
            self.font_family = font_var.get().strip() or "Arial"
            self.font_size = int(size_var.get())
            self.font_bold = bool(bold_var.get())
            self.font_italic = bool(italic_var.get())
            win.destroy()

        tk.Button(win, text="Apply", command=apply).pack(pady=8)

    def new_file(self):
        if messagebox.askyesno("New", "Clear the current drawing?"):
            self.image = Image.new("RGB", (self.canvas_width, self.canvas_height), "white")
            self.draw = ImageDraw.Draw(self.image)
            self.undo_stack.clear()
            self.redo_stack.clear()
            self.clear_selection()
            self.redraw_canvas(force=True)

    def open_file(self):
        path = filedialog.askopenfilename(filetypes=[("Image files", "*.png;*.jpg;*.jpeg;*.bmp")])
        if not path:
            return
        img = Image.open(path).convert("RGB")
        self.canvas_width, self.canvas_height = img.size
        self.image = Image.new("RGB", (self.canvas_width, self.canvas_height), "white")
        self.image.paste(img, (0, 0))
        self.draw = ImageDraw.Draw(self.image)
        self.undo_stack.clear()
        self.redo_stack.clear()
        self.clear_selection()
        self.redraw_canvas(force=True)

    def save_file(self, save_as=False):
        if not hasattr(self, "save_path") or save_as:
            self.save_path = filedialog.asksaveasfilename(defaultextension=".png", filetypes=[("PNG", "*.png")])
        if self.save_path:
            self.image.save(self.save_path)

    def redraw_canvas(self, force=False):
        now = time.time()
        if not force and (now - self.last_redraw_time) < 0.03:
            return
        self.last_redraw_time = now
        if self.zoom == 1.0:
            display = self.image
        else:
            w = int(self.image.width * self.zoom)
            h = int(self.image.height * self.zoom)
            display = self.image.resize((w, h), Image.NEAREST)
        self.display_image = ImageTk.PhotoImage(display)
        if self.display_image_id is None:
            self.display_image_id = self.canvas.create_image(0, 0, image=self.display_image, anchor="nw")
        else:
            self.canvas.itemconfig(self.display_image_id, image=self.display_image)
        self.canvas.lower(self.display_image_id)
        self.canvas.config(scrollregion=(0, 0, int(self.image.width * self.zoom), int(self.image.height * self.zoom)))
        self.redraw_selection_overlay()

    def push_undo(self):
        self.undo_stack.append(self.image.copy())
        self.redo_stack.clear()

    def undo(self):
        if not self.undo_stack:
            return
        self.redo_stack.append(self.image.copy())
        self.image = self.undo_stack.pop()
        self.draw = ImageDraw.Draw(self.image)
        self.redraw_canvas(force=True)

    def redo(self):
        if not self.redo_stack:
            return
        self.undo_stack.append(self.image.copy())
        self.image = self.redo_stack.pop()
        self.draw = ImageDraw.Draw(self.image)
        self.redraw_canvas(force=True)

    def to_image_coords(self, event):
        x = self.canvas.canvasx(event.x)
        y = self.canvas.canvasy(event.y)
        return int(x / self.zoom), int(y / self.zoom)

    def on_motion(self, event):
        ix, iy = self.to_image_coords(event)
        self.coord_label.config(text=f"X: {ix}  Y: {iy}")

    def on_click(self, event):
        self.start_x, self.start_y = self.to_image_coords(event)
        self.brush_size = int(self.brush_size)

        if self.active_tool == "pan":
            self.canvas.scan_mark(event.x, event.y)
            return

        if self.selection_active and self.is_point_in_selection(self.start_x, self.start_y):
            self.selection_dragging = True
            x0, y0, x1, y1 = self.selection_bbox
            self.selection_offset = (self.start_x - x0, self.start_y - y0)
            if not self.selection_cleared:
                self.push_undo()
                self.clear_selection_area()
                self.selection_cleared = True
            return

        if self.active_tool == "text":
            text = simpledialog.askstring("Text", "Enter text:")
            if text:
                self.font_family = self.font_family or "Arial"
                self.push_undo()
                self.draw_text(self.start_x, self.start_y, text)
                self.redraw_canvas(force=True)
            return

        if self.active_tool == "fill":
            self.push_undo()
            self.flood_fill(self.start_x, self.start_y, self.primary_color)
            self.redraw_canvas(force=True)
            return

        if self.active_tool == "picker":
            self.pick_color(self.start_x, self.start_y)
            return

        if self.active_tool == "select":
            self.clear_selection_overlay()
            self.selection_points = [(self.start_x, self.start_y)]
            if self.selection_mode == "rect":
                self.selection_rect = self.canvas.create_rectangle(
                    self.start_x * self.zoom,
                    self.start_y * self.zoom,
                    self.start_x * self.zoom,
                    self.start_y * self.zoom,
                    outline="red",
                    dash=(4, 4),
                )
            else:
                self.drag_points = [self.start_x, self.start_y]
            return
        if self.active_tool in ("select_zone", "select_webhook"):
            if self.selection_rect:
                self.canvas.delete(self.selection_rect)
            self.selection_rect = self.canvas.create_rectangle(
                self.start_x * self.zoom,
                self.start_y * self.zoom,
                self.start_x * self.zoom,
                self.start_y * self.zoom,
                outline="red",
                dash=(4, 4),
            )
            return

        if self.active_tool in ("line", "rect", "ellipse"):
            self.drag_preview = None
            self.push_undo()
            return

        self.push_undo()

    def on_drag(self, event):
        cx, cy = self.to_image_coords(event)

        if self.active_tool == "pan":
            self.canvas.scan_dragto(event.x, event.y, gain=1)
            return

        if self.selection_dragging and self.selection_active:
            x0, y0, x1, y1 = self.selection_bbox
            nx0 = cx - self.selection_offset[0]
            ny0 = cy - self.selection_offset[1]
            nx1 = nx0 + (x1 - x0)
            ny1 = ny0 + (y1 - y0)
            self.selection_bbox = (nx0, ny0, nx1, ny1)
            self.redraw_canvas(force=True)
            return

        if self.active_tool == "pencil":
            self.draw.line((self.start_x, self.start_y, cx, cy), fill=self.primary_color, width=1)
            self.temp_draw_ids.append(
                self.canvas.create_line(
                    self.start_x * self.zoom,
                    self.start_y * self.zoom,
                    cx * self.zoom,
                    cy * self.zoom,
                    fill=self.primary_color,
                    width=max(1, int(1 * self.zoom)),
                )
            )
            self.start_x, self.start_y = cx, cy
        elif self.active_tool == "brush":
            w = self.brush_size
            self.apply_brush(self.start_x, self.start_y, cx, cy, w)
            self.temp_draw_ids.append(
                self.canvas.create_line(
                    self.start_x * self.zoom,
                    self.start_y * self.zoom,
                    cx * self.zoom,
                    cy * self.zoom,
                    fill=self.primary_color,
                    width=max(1, int(w * self.zoom)),
                )
            )
            self.start_x, self.start_y = cx, cy
        elif self.active_tool == "eraser":
            w = self.brush_size
            self.draw.line((self.start_x, self.start_y, cx, cy), fill="#ffffff", width=w)
            self.temp_draw_ids.append(
                self.canvas.create_line(
                    self.start_x * self.zoom,
                    self.start_y * self.zoom,
                    cx * self.zoom,
                    cy * self.zoom,
                    fill="#ffffff",
                    width=max(1, int(w * self.zoom)),
                )
            )
            self.start_x, self.start_y = cx, cy
        elif self.active_tool in ("line", "rect", "ellipse"):
            if self.drag_preview:
                self.canvas.delete(self.drag_preview)
            if self.active_tool == "line":
                self.drag_preview = self.canvas.create_line(
                    self.start_x * self.zoom,
                    self.start_y * self.zoom,
                    cx * self.zoom,
                    cy * self.zoom,
                    fill=self.primary_color,
                    width=self.brush_size,
                )
            elif self.active_tool == "rect":
                self.drag_preview = self.canvas.create_rectangle(
                    self.start_x * self.zoom,
                    self.start_y * self.zoom,
                    cx * self.zoom,
                    cy * self.zoom,
                    outline=self.primary_color,
                    width=self.brush_size,
                )
            elif self.active_tool == "ellipse":
                self.drag_preview = self.canvas.create_oval(
                    self.start_x * self.zoom,
                    self.start_y * self.zoom,
                    cx * self.zoom,
                    cy * self.zoom,
                    outline=self.primary_color,
                    width=self.brush_size,
                )
        elif self.active_tool == "select":
            if self.selection_mode == "rect" and self.selection_rect:
                self.canvas.coords(self.selection_rect, self.start_x * self.zoom, self.start_y * self.zoom, cx * self.zoom, cy * self.zoom)
            elif self.selection_mode == "free":
                self.selection_points.append((cx, cy))
                if self.drag_points:
                    self.drag_points.extend([cx, cy])
                    if self.selection_rect:
                        self.canvas.delete(self.selection_rect)
                    self.selection_rect = self.canvas.create_line(
                        [p * self.zoom for p in self.drag_points],
                        fill="red",
                        width=1,
                    )
        elif self.active_tool in ("select_zone", "select_webhook"):
            if self.selection_rect:
                self.canvas.coords(self.selection_rect, self.start_x * self.zoom, self.start_y * self.zoom, cx * self.zoom, cy * self.zoom)

    def on_release(self, event):
        cx, cy = self.to_image_coords(event)

        if self.selection_dragging:
            self.selection_dragging = False
            self.commit_selection_move()
            return

        if self.active_tool in ("pencil", "brush", "eraser"):
            self.clear_temp_draw()
            self.redraw_canvas(force=True)
            return

        if self.active_tool in ("line", "rect", "ellipse"):
            w = self.brush_size
            if self.drag_preview:
                self.canvas.delete(self.drag_preview)
                self.drag_preview = None
            x1, y1 = self.start_x, self.start_y
            x2, y2 = cx, cy
            if self.active_tool == "line":
                self.draw.line((x1, y1, x2, y2), fill=self.primary_color, width=w)
            else:
                x0, y0 = min(x1, x2), min(y1, y2)
                x3, y3 = max(x1, x2), max(y1, y2)
                fill = None
                outline = None
                if self.shape_fill_mode == "outline":
                    outline = self.primary_color
                elif self.shape_fill_mode == "fill":
                    fill = self.secondary_color
                else:
                    outline = self.primary_color
                    fill = self.secondary_color
                if self.active_tool == "rect":
                    self.draw.rectangle((x0, y0, x3, y3), outline=outline, fill=fill, width=w)
                else:
                    self.draw.ellipse((x0, y0, x3, y3), outline=outline, fill=fill, width=w)
            self.redraw_canvas(force=True)

        if self.active_tool == "select":
            if self.selection_mode == "rect" and self.selection_rect:
                x0, y0, x1, y1 = self.canvas.coords(self.selection_rect)
                self.canvas.delete(self.selection_rect)
                self.selection_rect = None
                self.create_rect_selection(int(x0 / self.zoom), int(y0 / self.zoom), int(x1 / self.zoom), int(y1 / self.zoom))
            elif self.selection_mode == "free":
                if self.selection_rect:
                    self.canvas.delete(self.selection_rect)
                    self.selection_rect = None
                self.create_freeform_selection(self.selection_points)
                self.drag_points = None

        if self.active_tool == "select_zone":
            self.draw_zone = [self.start_x, self.start_y, cx, cy]
            if self.selection_rect:
                self.canvas.delete(self.selection_rect)
                self.selection_rect = None
        elif self.active_tool == "select_webhook":
            x1, y1 = min(self.start_x, cx), min(self.start_y, cy)
            x2, y2 = max(self.start_x, cx), max(self.start_y, cy)
            if self.selection_rect:
                self.canvas.delete(self.selection_rect)
                self.selection_rect = None
            self.save_selection_and_send(x1, y1, x2, y2)

    def on_right_click(self, event):
        if self.active_tool == "picker":
            ix, iy = self.to_image_coords(event)
            self.pick_color(ix, iy, secondary=True)

    def apply_brush(self, x1, y1, x2, y2, size):
        if self.brush_type == "airbrush":
            radius = max(2, size)
            for _ in range(30):
                ox = random.randint(-radius, radius)
                oy = random.randint(-radius, radius)
                if ox * ox + oy * oy <= radius * radius:
                    self.draw.point((x2 + ox, y2 + oy), fill=self.primary_color)
        elif self.brush_type == "calligraphy":
            self.draw.line((x1, y1, x2, y2), fill=self.primary_color, width=max(1, size))
            self.draw.line((x1 + size // 2, y1 - size // 2, x2 + size // 2, y2 - size // 2), fill=self.primary_color, width=max(1, size))
        elif self.brush_type == "marker":
            c = blend_color(self.primary_color, "#ffffff", 0.4)
            self.draw.line((x1, y1, x2, y2), fill=c, width=max(1, size * 2))
        elif self.brush_type == "square":
            self.draw.line((x1, y1, x2, y2), fill=self.primary_color, width=max(1, size))
        else:
            self.draw.line((x1, y1, x2, y2), fill=self.primary_color, width=max(1, size))

    def clear_canvas(self):
        self.push_undo()
        self.draw.rectangle((0, 0, self.canvas_width, self.canvas_height), fill="white")
        self.clear_selection()
        self.redraw_canvas(force=True)

    def pick_color(self, x, y, secondary=False):
        if 0 <= x < self.canvas_width and 0 <= y < self.canvas_height:
            r, g, b = self.image.getpixel((x, y))
            color = f"#{r:02x}{g:02x}{b:02x}"
            if secondary:
                self.set_secondary(color)
            else:
                self.set_primary(color)

    def flood_fill(self, x, y, fill_color):
        if not (0 <= x < self.canvas_width and 0 <= y < self.canvas_height):
            return
        target = self.image.getpixel((x, y))
        fill = ImageColor(fill_color)
        if target == fill:
            return
        pixels = self.image.load()
        stack = [(x, y)]
        while stack:
            px, py = stack.pop()
            if 0 <= px < self.canvas_width and 0 <= py < self.canvas_height and pixels[px, py] == target:
                pixels[px, py] = fill
                stack.append((px + 1, py))
                stack.append((px - 1, py))
                stack.append((px, py + 1))
                stack.append((px, py - 1))

    def draw_text(self, x, y, text):
        font = self.load_font(self.font_family, self.font_size)
        if self.font_bold:
            self.draw.text((x + 1, y), text, fill=self.primary_color, font=font)
        if self.font_italic:
            temp = Image.new("RGBA", self.image.size, (0, 0, 0, 0))
            td = ImageDraw.Draw(temp)
            td.text((x, y), text, fill=self.primary_color, font=font)
            temp = temp.transform(temp.size, Image.AFFINE, (1, -0.3, 0, 0, 1, 0))
            self.image.paste(Image.alpha_composite(self.image.convert("RGBA"), temp).convert("RGB"))
            self.draw = ImageDraw.Draw(self.image)
        else:
            self.draw.text((x, y), text, fill=self.primary_color, font=font)

    def load_font(self, family, size):
        try:
            return ImageFont.truetype(family, size)
        except Exception:
            return ImageFont.load_default()

    # Selection
    def clear_selection(self):
        self.selection_active = False
        self.selection_bbox = None
        self.selection_image = None
        self.selection_mask = None
        self.selection_points = []
        self.selection_dragging = False
        self.selection_cleared = False
        self.clear_selection_overlay()

    def clear_selection_overlay(self):
        if self.selection_rect:
            self.canvas.delete(self.selection_rect)
            self.selection_rect = None
        if self.selection_preview_id:
            self.canvas.delete(self.selection_preview_id)
            self.selection_preview_id = None
            self.selection_preview_tk = None

    def create_rect_selection(self, x0, y0, x1, y1):
        x0, y0 = max(0, min(x0, self.canvas_width)), max(0, min(y0, self.canvas_height))
        x1, y1 = max(0, min(x1, self.canvas_width)), max(0, min(y1, self.canvas_height))
        if x1 <= x0 or y1 <= y0:
            self.clear_selection()
            return
        self.selection_bbox = (x0, y0, x1, y1)
        self.selection_image = self.image.crop(self.selection_bbox)
        self.selection_mask = Image.new("L", (x1 - x0, y1 - y0), 255)
        self.selection_active = True
        self.selection_cleared = False
        self.redraw_canvas(force=True)

    def create_freeform_selection(self, points):
        if len(points) < 3:
            self.clear_selection()
            return
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        x0, y0, x1, y1 = max(0, min(xs)), max(0, min(ys)), min(self.canvas_width, max(xs)), min(self.canvas_height, max(ys))
        if x1 <= x0 or y1 <= y0:
            self.clear_selection()
            return
        bbox = (x0, y0, x1, y1)
        mask = Image.new("L", (x1 - x0, y1 - y0), 0)
        md = ImageDraw.Draw(mask)
        shifted = [(x - x0, y - y0) for x, y in points]
        md.polygon(shifted, fill=255)
        self.selection_bbox = bbox
        self.selection_image = self.image.crop(bbox)
        self.selection_mask = mask
        self.selection_active = True
        self.selection_cleared = False
        self.redraw_canvas(force=True)

    def is_point_in_selection(self, x, y):
        if not self.selection_active or not self.selection_bbox:
            return False
        x0, y0, x1, y1 = self.selection_bbox
        return x0 <= x <= x1 and y0 <= y <= y1

    def clear_selection_area(self):
        if not self.selection_bbox:
            return
        x0, y0, x1, y1 = self.selection_bbox
        self.draw.rectangle((x0, y0, x1, y1), fill="white")

    def commit_selection_move(self):
        if not self.selection_active or not self.selection_bbox:
            return
        if self.selection_image is None:
            return
        x0, y0, x1, y1 = self.selection_bbox
        if self.selection_mask:
            self.image.paste(self.selection_image, (x0, y0), mask=self.selection_mask)
        else:
            self.image.paste(self.selection_image, (x0, y0))
        self.selection_cleared = False
        self.redraw_canvas(force=True)

    def redraw_selection_overlay(self):
        if not self.selection_active or not self.selection_bbox:
            return
        x0, y0, x1, y1 = self.selection_bbox
        if self.selection_preview_tk:
            self.canvas.delete(self.selection_preview_id)
            self.selection_preview_id = None
            self.selection_preview_tk = None
        if self.selection_image:
            preview = self.selection_image
            if self.selection_mask:
                preview = self.selection_image.copy()
                preview.putalpha(self.selection_mask)
            if self.zoom != 1.0:
                preview = preview.resize((int(preview.width * self.zoom), int(preview.height * self.zoom)), Image.NEAREST)
            self.selection_preview_tk = ImageTk.PhotoImage(preview)
            self.selection_preview_id = self.canvas.create_image(x0 * self.zoom, y0 * self.zoom, image=self.selection_preview_tk, anchor="nw")
        self.selection_rect = self.canvas.create_rectangle(
            x0 * self.zoom,
            y0 * self.zoom,
            x1 * self.zoom,
            y1 * self.zoom,
            outline="red",
            dash=(4, 4),
        )

    # Clipboard
    def copy_selection(self):
        if self.selection_active and self.selection_image is not None:
            self.clipboard_image = self.selection_image.copy()
            self.clipboard_mask = self.selection_mask.copy() if self.selection_mask else None
        else:
            self.clipboard_image = self.image.copy()
            self.clipboard_mask = None

    def cut_selection(self):
        if self.selection_active and self.selection_image is not None:
            self.copy_selection()
            self.push_undo()
            self.clear_selection_area()
            self.clear_selection()
            self.redraw_canvas(force=True)

    def paste_clipboard(self):
        if self.clipboard_image is None:
            return
        self.selection_image = self.clipboard_image.copy()
        self.selection_mask = self.clipboard_mask.copy() if self.clipboard_mask else None
        w, h = self.selection_image.size
        x0 = max(0, (self.canvas_width - w) // 2)
        y0 = max(0, (self.canvas_height - h) // 2)
        self.selection_bbox = (x0, y0, x0 + w, y0 + h)
        self.selection_active = True
        self.selection_cleared = True
        self.redraw_canvas(force=True)

    # Image transforms
    def crop_to_selection(self):
        if not self.selection_active or not self.selection_bbox:
            return
        x0, y0, x1, y1 = self.selection_bbox
        self.push_undo()
        self.image = self.image.crop((x0, y0, x1, y1))
        self.canvas_width, self.canvas_height = self.image.size
        self.draw = ImageDraw.Draw(self.image)
        self.clear_selection()
        self.redraw_canvas(force=True)

    def resize_dialog(self):
        win = tk.Toplevel(self.root)
        win.title("Resize")
        win.geometry("260x200")
        win.configure(bg="#c0c0c0")
        tk.Label(win, text="Width", bg="#c0c0c0").pack(pady=2)
        w_var = tk.StringVar(value=str(self.canvas_width))
        tk.Entry(win, textvariable=w_var).pack()
        tk.Label(win, text="Height", bg="#c0c0c0").pack(pady=2)
        h_var = tk.StringVar(value=str(self.canvas_height))
        tk.Entry(win, textvariable=h_var).pack()
        unit_var = tk.StringVar(value="pixels")
        tk.Radiobutton(win, text="Pixels", value="pixels", variable=unit_var, bg="#c0c0c0").pack(anchor="w")
        tk.Radiobutton(win, text="Percent", value="percent", variable=unit_var, bg="#c0c0c0").pack(anchor="w")
        tk.Label(win, text="Skew X (%)", bg="#c0c0c0").pack(pady=2)
        skewx_var = tk.StringVar(value="0")
        tk.Entry(win, textvariable=skewx_var).pack()
        tk.Label(win, text="Skew Y (%)", bg="#c0c0c0").pack(pady=2)
        skewy_var = tk.StringVar(value="0")
        tk.Entry(win, textvariable=skewy_var).pack()

        def apply():
            try:
                w = float(w_var.get())
                h = float(h_var.get())
                if unit_var.get() == "percent":
                    w = int(self.canvas_width * (w / 100.0))
                    h = int(self.canvas_height * (h / 100.0))
                w = max(1, int(w))
                h = max(1, int(h))
                skewx = float(skewx_var.get())
                skewy = float(skewy_var.get())
            except Exception:
                messagebox.showerror("Error", "Invalid values")
                return
            self.push_undo()
            self.image = self.image.resize((w, h), Image.NEAREST)
            if skewx != 0 or skewy != 0:
                self.image = self.apply_skew(self.image, skewx, skewy)
            self.canvas_width, self.canvas_height = self.image.size
            self.draw = ImageDraw.Draw(self.image)
            self.clear_selection()
            self.redraw_canvas(force=True)
            win.destroy()

        tk.Button(win, text="Apply", command=apply).pack(pady=6)

    def apply_skew(self, img, skewx, skewy):
        w, h = img.size
        dx = int(abs(skewx) * h / 100.0)
        dy = int(abs(skewy) * w / 100.0)
        new_w = w + dx
        new_h = h + dy
        a = 1
        b = skewx / 100.0
        c = 0
        d = skewy / 100.0
        e = 1
        f = 0
        return img.transform((new_w, new_h), Image.AFFINE, (a, b, c, d, e, f), fillcolor="white")

    def rotate_menu(self):
        win = tk.Toplevel(self.root)
        win.title("Rotate")
        win.geometry("200x220")
        win.configure(bg="#c0c0c0")
        tk.Button(win, text="Rotate 90", command=lambda: self.apply_rotate(90, win)).pack(pady=4)
        tk.Button(win, text="Rotate 180", command=lambda: self.apply_rotate(180, win)).pack(pady=4)
        tk.Button(win, text="Rotate 270", command=lambda: self.apply_rotate(270, win)).pack(pady=4)
        tk.Button(win, text="Flip Horizontal", command=lambda: self.apply_flip("h", win)).pack(pady=4)
        tk.Button(win, text="Flip Vertical", command=lambda: self.apply_flip("v", win)).pack(pady=4)

    def apply_rotate(self, angle, win=None):
        self.push_undo()
        self.image = self.image.rotate(-angle, expand=True, fillcolor="white")
        self.canvas_width, self.canvas_height = self.image.size
        self.draw = ImageDraw.Draw(self.image)
        self.clear_selection()
        self.redraw_canvas(force=True)
        if win:
            win.destroy()

    def apply_flip(self, mode, win=None):
        self.push_undo()
        if mode == "h":
            self.image = ImageOps.mirror(self.image)
        else:
            self.image = ImageOps.flip(self.image)
        self.draw = ImageDraw.Draw(self.image)
        self.clear_selection()
        self.redraw_canvas(force=True)
        if win:
            win.destroy()

    # File browser
    def open_custom_browser(self):
        self.browser = tk.Toplevel(self.root)
        self.browser.title("Explorer")
        self.browser.geometry("700x500")
        nav = tk.Frame(self.browser, bg="#c0c0c0")
        nav.pack(side="top", fill="x", pady=5)
        tk.Button(nav, text="Linux Home", command=lambda: self.load_dir(self.linux_path)).pack(side="left", padx=5)
        tk.Button(nav, text="Downloads", command=lambda: self.load_dir(self.chrome_path)).pack(side="left")
        self.file_list = tk.Listbox(self.browser, width=40)
        self.file_list.pack(side="left", expand=True, fill="both", padx=5, pady=5)
        self.file_list.bind('<<ListboxSelect>>', self.update_preview)
        self.preview_panel = tk.Frame(self.browser, width=250, bg="#808080", relief="sunken", bd=2)
        self.preview_panel.pack(side="right", fill="y", padx=5, pady=5)
        self.img_display = tk.Label(self.preview_panel, bg="#808080")
        self.img_display.pack(expand=True)
        tk.Button(self.preview_panel, text="SELECT IMAGE", command=self.confirm_file).pack(side="bottom", fill="x", pady=10)
        self.load_dir(self.linux_path)

    def load_dir(self, path):
        if not os.path.exists(path):
            return
        self.current_dir = path
        self.file_list.delete(0, tk.END)
        for f in os.listdir(path):
            if f.lower().endswith((".png", ".jpg", ".jpeg", ".bmp")):
                self.file_list.insert(tk.END, f)

    def update_preview(self, event):
        sel = self.file_list.curselection()
        if sel:
            path = os.path.join(self.current_dir, self.file_list.get(sel[0]))
            try:
                img = Image.open(path)
                img.thumbnail((200, 200))
                self.tk_pre = ImageTk.PhotoImage(img)
                self.img_display.config(image=self.tk_pre)
            except Exception:
                pass

    def confirm_file(self):
        sel = self.file_list.curselection()
        if sel:
            self.img_path = os.path.join(self.current_dir, self.file_list.get(sel[0]))
            self.browser.destroy()

    # Auto draw
    def open_auto_draw_window(self):
        if hasattr(self, "ad_win") and self.ad_win.winfo_exists():
            self.ad_win.lift()
            return
        self.ad_win = tk.Toplevel(self.root)
        self.ad_win.title("Auto Draw")
        self.ad_win.geometry("280x380")
        self.ad_win.configure(bg="#c0c0c0", bd=2, relief="raised")
        tk.Label(self.ad_win, text="Auto Draw Tools", bg="#000080", fg="white").pack(fill="x", pady=2)
        tk.Button(self.ad_win, text="1. Select Zone", width=20, command=lambda: self.set_tool("select_zone")).pack(pady=10)
        self.color_var = tk.BooleanVar(value=False)
        tk.Checkbutton(self.ad_win, text="Color it in", variable=self.color_var, bg="#c0c0c0").pack()
        self.speed_scale = tk.Scale(self.ad_win, from_=0.001, to=0.05, resolution=0.001, orient="horizontal", label="Speed", bg="#c0c0c0")
        self.speed_scale.set(0.005)
        self.speed_scale.pack(pady=5, padx=10, fill="x")
        tk.Button(self.ad_win, text="START DRAWING", bg="green", fg="white", width=20, command=self.run_thread).pack(pady=10)
        tk.Button(self.ad_win, text="STOP", bg="red", fg="white", width=20, command=lambda: setattr(self, "is_drawing_auto", False)).pack()
        self.ad_win.update_idletasks()
        self.ad_win.lift()

    def run_thread(self):
        if self.img_path:
            self.is_drawing_auto = True
            threading.Thread(target=self.process_and_draw, daemon=True).start()
        else:
            messagebox.showwarning("Warning", "Select an image first!")

    def process_and_draw(self):
        img = cv2.imread(self.img_path)
        if img is None:
            return
        x1, y1, x2, y2 = self.draw_zone if self.draw_zone else (100, 100, 500, 400)
        tw, th = int(abs(x2 - x1)), int(abs(y2 - y1))
        ox, oy = int(min(x1, x2)), int(min(y1, y2))
        if tw <= 0 or th <= 0:
            return
        img = cv2.resize(img, (tw, th))
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        edges = cv2.Canny(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), 100, 200)
        contours, _ = cv2.findContours(edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours:
            if not self.is_drawing_auto:
                return
            pts = cnt.reshape(-1, 2)
            px = py = None
            for x, y in pts:
                cx, cy = x + ox, y + oy
                if px is not None:
                    self.safe_draw(px, py, cx, cy, "black", 1)
                    time.sleep(self.speed_scale.get())
                px, py = cx, cy
        if self.color_var.get():
            for y in range(0, th, 15):
                x_it = range(0, tw, 12) if y % 30 == 0 else range(tw - 1, -1, -12)
                for x in x_it:
                    if not self.is_drawing_auto:
                        return
                    r, g, b = img_rgb[y, x]
                    if r > 245 and g > 245 and b > 245:
                        continue
                    self.safe_draw(x + ox, y + oy, x + ox + 12, y + oy, f"#{r:02x}{g:02x}{b:02x}", 10)
                    time.sleep(self.speed_scale.get() * 2)
        self.redraw_canvas(force=True)

    def safe_draw(self, x1, y1, x2, y2, color, w):
        try:
            self.draw.line((x1, y1, x2, y2), fill=color, width=w)
            self.redraw_canvas()
        except Exception:
            pass

    # Rating
    def open_rating_window(self):
        self.rate_win = tk.Toplevel(self.root)
        self.rate_win.title("Rate My Paint")
        self.rate_win.geometry("350x500")
        self.rate_win.configure(bg="#c0c0c0")
        self.attach_image_var = tk.BooleanVar(value=False)
        self.comment_required = True
        tk.Label(self.rate_win, text="Select Stars:", bg="#c0c0c0", font=("Arial", 10, "bold")).pack(pady=5)
        sf = tk.Frame(self.rate_win, bg="#c0c0c0")
        sf.pack()
        self.star_btns = []
        for i in range(1, 6):
            b = tk.Button(sf, text="*", font=("Arial", 18), command=lambda x=i: self.set_rating(x), relief="flat", bg="#c0c0c0")
            b.pack(side="left")
            self.star_btns.append(b)
        self.feedback_text = scrolledtext.ScrolledText(self.rate_win, width=35, height=8)
        self.feedback_text.pack(padx=10, pady=5)
        tk.Button(self.rate_win, text="Select Drawing Area...", command=self.require_attach_area).pack(pady=5)
        tk.Checkbutton(self.rate_win, text="Attach selected drawing area", variable=self.attach_image_var, bg="#c0c0c0").pack(pady=5)
        tk.Button(self.rate_win, text="SEND REVIEW", bg="#000080", fg="white", command=self.handle_send).pack(pady=10)

    def set_rating(self, val):
        self.rating = val
        for i, b in enumerate(self.star_btns):
            b.config(text="*" if i < val else "o", fg="orange" if i < val else "black")

    def handle_send(self):
        if self.rating == 0:
            messagebox.showwarning("Wait", "Select stars!")
            return
        if self.comment_required and not self.feedback_text.get("1.0", tk.END).strip():
            messagebox.showwarning("Wait", "Please add a comment.")
            return
        if self.attach_image_var.get():
            self.rate_win.withdraw()
            self.set_tool("select_webhook")
            messagebox.showinfo("Select", "Drag a red box around your drawing to send it!")
        else:
            self.send_to_discord()

    def require_attach_area(self):
        self.attach_image_var.set(True)
        self.rate_win.withdraw()
        self.set_tool("select_webhook")
        messagebox.showinfo("Select", "Drag a red box around your drawing to attach it.")

    def set_webhook_dialog(self):
        url = simpledialog.askstring("Webhook", "Discord Webhook URL:", initialvalue=self.webhook_url or "")
        if url:
            self.save_webhook(url)
            messagebox.showinfo("Saved", "Webhook saved locally.")
            return True
        return False

    def save_selection_and_send(self, x1, y1, x2, y2):
        x1 = max(0, min(self.canvas_width, int(x1)))
        y1 = max(0, min(self.canvas_height, int(y1)))
        x2 = max(0, min(self.canvas_width, int(x2)))
        y2 = max(0, min(self.canvas_height, int(y2)))
        if x2 <= x1 or y2 <= y1:
            self.send_to_discord()
            return
        crop = self.image.crop((x1, y1, x2, y2))
        path = "capture.png"
        crop.save(path)
        self.set_tool("pencil")
        self.send_to_discord(path)

    def send_to_discord(self, filepath=None):
        url = os.environ.get("PAINT_WEBHOOK_URL", "").strip() or self.webhook_url
        if not url:
            if not self.set_webhook_dialog():
                messagebox.showerror("Webhook Missing", "Set a webhook to send reviews.")
                if self.rate_win:
                    self.rate_win.deiconify()
                return
            url = self.webhook_url
        data = {
            "embeds": [
                {
                    "title": "Application Review",
                    "color": 0x00FF00 if self.rating > 3 else 0xFF0000,
                    "fields": [
                        {"name": "User", "value": f"{self.username}", "inline": True},
                        {"name": "Rating", "value": ("★" * self.rating) + ("☆" * (5 - self.rating)), "inline": True},
                        {"name": "Feedback", "value": self.feedback_text.get("1.0", tk.END).strip() or "No comment provided."},
                    ],
                    "footer": {"text": "PaintBot Engine v2.0"},
                }
            ]
        }
        try:
            if filepath:
                with open(filepath, "rb") as f:
                    requests.post(url, data={"payload_json": json.dumps(data)}, files={"file": f})
                os.remove(filepath)
            else:
                requests.post(url, json=data)
            messagebox.showinfo("Sent", f"Feedback received! Thanks, {self.username}")
            self.rate_win.destroy()
        except Exception:
            messagebox.showerror("Error", "Could not reach Discord.")


def ImageColor(hex_color):
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))


def blend_color(c1, c2, t):
    r1, g1, b1 = ImageColor(c1)
    r2, g2, b2 = ImageColor(c2)
    r = int(r1 + (r2 - r1) * t)
    g = int(g1 + (g2 - g1) * t)
    b = int(b1 + (b2 - b1) * t)
    return f"#{r:02x}{g:02x}{b:02x}"


if __name__ == "__main__":
    root = tk.Tk()
    app = Win95Paint(root)
    root.mainloop()
