import os
import json
import time
import requests

# Configuration
TB_URL = "http://thingsboard:9090"
USERNAME = os.getenv("TB_ADMIN_USER", "tenant@thingsboard.org")
PASSWORD = os.getenv("TB_ADMIN_PASS", "tenant")

# Device Settings
DEVICE_NAME = "scanner"
DEVICE_TOKEN = "my_scanner_token"

DASHBOARD_FILE = "/config/dashboard.json"

def get_token():
    """Authenticates and returns the JWT token. Returns None if failed."""
    url = f"{TB_URL}/api/auth/login"
    try:
        response = requests.post(url, json={"username": USERNAME, "password": PASSWORD}, timeout=2)
        if response.status_code == 200:
            return response.json()["token"]
        else:
            # Service is up but returning 401/500/etc
            return None
    except requests.exceptions.ConnectionError:
        # Service is not listening on port 9090 yet
        return None
    except Exception as e:
        print(f"Unexpected error: {e}")
        return None

def create_or_update_device(token):
    """
    Returns True if a NEW device was created.
    Returns False if the device already existed.
    """
    headers = {"X-Authorization": f"Bearer {token}"}
    device_id = None

    # 1. Check if device exists
    print(f"Checking for device '{DEVICE_NAME}'...")
    check_url = f"{TB_URL}/api/tenant/devices?deviceName={DEVICE_NAME}"
    resp = requests.get(check_url, headers=headers)
    
    # --- CHANGE: If found, we STOP here ---
    if resp.status_code == 200:
        print(f"Device '{DEVICE_NAME}' already exists. Skipping access token and dashboard config.")
        return False
    # --------------------------------------

    # 2. Create device (Only runs if 404 above)
    print(f"Device not found. Creating '{DEVICE_NAME}'...")
    create_url = f"{TB_URL}/api/device"
    device_data = {"name": DEVICE_NAME, "type": "default"}
    create_resp = requests.post(create_url, json=device_data, headers=headers)
    
    if create_resp.status_code == 200:
        device_id = create_resp.json()['id']['id']
        print("Device created successfully.")
    else:
        print(f"Failed to create device: {create_resp.text}")
        return False

    # 3. Set Specific Access Token (Only runs for NEW devices)
    if device_id:
        print(f"Setting access token to '{DEVICE_TOKEN}'...")
        
        # URL for FETCHING (GET)
        get_cred_url = f"{TB_URL}/api/device/{device_id}/credentials"
        # URL for SAVING (POST) - Generic endpoint
        save_cred_url = f"{TB_URL}/api/device/credentials"

        cred_resp = requests.get(get_cred_url, headers=headers)
        
        if cred_resp.status_code == 200:
            creds = cred_resp.json()
            creds['credentialsType'] = 'ACCESS_TOKEN'
            creds['credentialsId'] = DEVICE_TOKEN
            
            # Post to the generic save endpoint
            save_resp = requests.post(save_cred_url, json=creds, headers=headers)
            
            if save_resp.status_code == 200:
                print("Access token updated successfully.")
            else:
                print(f"Failed to update token: {save_resp.text}")
        else:
             print(f"Could not fetch credentials: {cred_resp.text}")

    return True

def import_dashboard(token):
    """Imports the dashboard from JSON."""
    if not os.path.exists(DASHBOARD_FILE):
        print("No dashboard file found. Skipping.")
        return

    with open(DASHBOARD_FILE, 'r') as f:
        dashboard_json = json.load(f)

    headers = {"X-Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # Remove ID to prevent conflicts on re-import
    if 'id' in dashboard_json:
        del dashboard_json['id']

    print(f"Importing dashboard from {DASHBOARD_FILE}...")
    url = f"{TB_URL}/api/dashboard"
    response = requests.post(url, json=dashboard_json, headers=headers)
    
    if response.status_code == 200:
        print("Dashboard imported successfully.")
    else:
        print(f"Failed to import dashboard: {response.text}")

# Main Loop
if __name__ == "__main__":
    print("Starting ThingsBoard Initializer (Fast Polling Mode)...")
    token = None
    
    start_time = time.time()
    while time.time() - start_time < 300:
        token = get_token()
        if token:
            print("ThingsBoard is UP! Proceeding with config...")
            break
        print("Waiting for ThingsBoard...", end='\r')
        time.sleep(2)

    if token:
        # We capture the return value (True/False)
        is_new_device = create_or_update_device(token)
        
        # Only import dashboard if we just created the device
        if is_new_device:
            import_dashboard(token)
            
        print("\nInitialization complete.")
        
        # (Optional) If you added the self-destruct logic, keep it here
    else:
        print("\nTimed out waiting for ThingsBoard.")
        exit(1)