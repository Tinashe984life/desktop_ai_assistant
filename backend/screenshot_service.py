from PIL import ImageGrab
import os
import datetime

def capture_screenshot():
    """Capture a screenshot of the entire screen and save it with a timestamp"""
    try:
        # Create screenshots directory if it doesn't exist
        os.makedirs("screenshots", exist_ok=True)
        
        # Generate timestamped filename
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"screenshots/screenshot_{timestamp}.png"
        
        # Capture full screen
        screenshot = ImageGrab.grab()
        screenshot.save(filename)
        print(f"Screenshot saved: {filename}")
        return filename
    except Exception as e:
        print(f"Error capturing screenshot: {str(e)}")
        return None

if __name__ == "__main__":
    # Capture screenshot when run directly
    capture_screenshot()