# ESP32 Setup Guide

This guide explains how to set up and upload the ESP32 code for both the base and arm controllers.

## Prerequisites

1. **Arduino IDE** (or PlatformIO)
2. **ESP32 Board Support** installed in Arduino IDE
3. **Required Libraries**:
   - ESPAsyncWebServer (by me-no-dev)
   - AsyncTCP (by me-no-dev)
   - ESP32Servo (for arm controller)

## Installing Libraries

### In Arduino IDE:
1. Go to **Tools → Manage Libraries**
2. Search and install:
   - **ESPAsyncWebServer** by me-no-dev
   - **AsyncTCP** by me-no-dev
   - **ESP32Servo** (for arm controller)

### Manual Installation (if needed):
If libraries are not found in Library Manager, install manually:
1. Download from GitHub:
   - ESPAsyncWebServer: https://github.com/me-no-dev/ESPAsyncWebServer
   - AsyncTCP: https://github.com/me-no-dev/AsyncTCP
   - ESP32Servo: https://github.com/madhephaestus/ESP32Servo
2. Extract to `Arduino/libraries/` folder

## Hardware Configuration

### Base ESP32 (Mecanum Wheels)

**Motor Driver Setup:**
- Uses PWM + Direction pins for each motor
- Default pins (adjust in code if needed):
  - Front Left:  GPIO 26 (PWM), 27 (DIR)
  - Front Right: GPIO 14 (PWM), 12 (DIR)
  - Rear Left:   GPIO 25 (PWM), 33 (DIR)
  - Rear Right:  GPIO 32 (PWM), 35 (DIR)

**Motor Driver Options:**
- L298N, L293D, or similar dual H-bridge drivers
- BTS7960 or similar high-current drivers
- Adjust pin assignments in `esp32_base.ino` based on your setup

### Arm ESP32 (4 DOF Arm)

**Servo Configuration:**
- Default pins (adjust in code if needed):
  - Base:     GPIO 2
  - Shoulder: GPIO 4
  - Elbow:    GPIO 5
  - Wrist:    GPIO 18
  - Gripper:  GPIO 19

**Servo Requirements:**
- Standard 180° servos (SG90, MG996R, etc.)
- 5V power supply (external recommended for multiple servos)
- PWM frequency: 50Hz (default)

## Uploading Code

### Base Controller:
1. Open `esp32_base.ino` in Arduino IDE
2. Select board: **Tools → Board → ESP32 Dev Module** (or your specific ESP32)
3. Select port: **Tools → Port → [Your ESP32 COM port]**
4. Adjust motor pins if needed
5. Click **Upload**

### Arm Controller:
1. Open `esp32_arm.ino` in Arduino IDE
2. Select board: **Tools → Board → ESP32 Dev Module**
3. Select port: **Tools → Port → [Your ESP32 COM port]**
4. Adjust servo pins if needed
5. Click **Upload**

## WiFi Configuration

### Default Settings:
- **Base AP**: SSID: `RobotBase`, Password: `robot1234`
- **Arm AP**: SSID: `RobotArm`, Password: `robot1234`
- **Port**: 81 (WebSocket)
- **Auth Token**: `mysecret`

### Changing WiFi Settings:
Edit these lines in the code:
```cpp
const char* ssid = "YourSSID";
const char* password = "YourPassword";
const char* authToken = "YourToken";
```

## Testing

1. **Upload code** to both ESP32s
2. **Connect to WiFi AP** from each ESP32:
   - Base: Connect to `RobotBase` network
   - Arm: Connect to `RobotArm` network
3. **Check Serial Monitor** (115200 baud) for IP addresses
4. **Update React app** with correct IP addresses:
   - Base IP: Usually `192.168.4.1` (default AP IP)
   - Arm IP: Usually `192.168.4.1` (if using separate ESP32s, they'll have different IPs)
5. **Connect** from the React app

## Troubleshooting

### Base Controller:
- **Motors not moving**: Check motor driver connections and power supply
- **Wrong direction**: Swap DIR pin logic or swap motor wires
- **Jittery movement**: Increase PWM frequency or add capacitors
- **Connection issues**: Check WiFi AP is running (check Serial Monitor)

### Arm Controller:
- **Servos not moving**: Check power supply (servos need 5V, may need external supply)
- **Servo jitter**: Add capacitors to servo power lines, check wiring
- **Wrong angles**: Adjust servo mounting or modify angle mapping
- **Connection issues**: Check WiFi AP is running

### General:
- **Can't connect**: Ensure you're connected to the ESP32's WiFi AP
- **Authentication fails**: Check token matches in both ESP32 and React app
- **WebSocket errors**: Check port 81 is not blocked by firewall

## Customization

### Adjusting Motor Speeds:
In `esp32_base.ino`, modify PWM settings:
```cpp
const int PWM_FREQ = 5000;        // Frequency
const int PWM_RESOLUTION = 8;     // 8-bit = 0-255
```

### Adjusting Servo Range:
In `esp32_arm.ino`, modify servo attachment:
```cpp
servoBase.attach(SERVO_BASE, 500, 2500); // min/max pulse width in microseconds
```

### Changing Pins:
Simply modify the pin definitions at the top of each file.

## Notes

- Both ESP32s create their own WiFi Access Points (AP mode)
- For better performance, connect both ESP32s to the same WiFi network (STA mode) and update code accordingly
- The base controller uses PWM for speed control and digital pins for direction
- The arm controller uses standard servo library with smooth movement
- Authentication token must match between ESP32 and React app

