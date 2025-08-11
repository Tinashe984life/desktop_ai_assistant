// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
async fn set_window_clickthrough(
    window: tauri::Window,
    clickthrough: bool,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::apply_blur;
        use windows::{
            Win32::UI::WindowsAndMessaging::{
                GetWindowLongPtrW, SetWindowLongPtrW, 
                WINDOW_LONG_PTR_INDEX, GWL_EXSTYLE,
                WS_EX_LAYERED, WS_EX_TRANSPARENT
            }
        };
        
        apply_blur(&window, None)
            .expect("Unsupported platform! Blur only works on Windows");
        
        let hwnd = window.hwnd().unwrap();
        let index = GWL_EXSTYLE;
        let style = unsafe { 
            GetWindowLongPtrW(hwnd, index) as u32
        };
        
        let new_style = if clickthrough {
            style | WS_EX_LAYERED.0 | WS_EX_TRANSPARENT.0
        } else {
            style & !(WS_EX_LAYERED.0 | WS_EX_TRANSPARENT.0)
        };
        
        unsafe { 
            SetWindowLongPtrW(
                hwnd, 
                index, 
                new_style as isize
            ) 
        };
    }
    
    #[cfg(target_os = "macos")]
    {
        use cocoa::appkit::{NSWindow, NSWindowStyleMask};
        use objc::{msg_send, sel, sel_impl};
        
        let ns_window = window.ns_window().unwrap() as cocoa::base::id;
        unsafe {
            let _: () = msg_send![ns_window, setIgnoresMouseEvents: clickthrough];
            ns_window.setBackgroundColor_(cocoa::base::nil);
            let mask = NSWindowStyleMask::NSBorderlessWindowMask;
            ns_window.setStyleMask_(mask);
        }
    }
    
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![set_window_clickthrough])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}