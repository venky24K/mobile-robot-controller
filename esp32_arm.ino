/*
 * ESP32 4 DOF Arm Controller (BLE Edition)
 * Controls 4 servos + 1 gripper via Bluetooth Low Energy
 * 
 * Protocol:
 * - A:base:shoulder:elbow:wrist:gripper
 *   Example: A:90:45:90:90:0
 * 
 * Pin Configuration:
 * - Servo 0 (Base):     GPIO 2
 * - Servo 1 (Shoulder): GPIO 4
 * - Servo 2 (Elbow):    GPIO 5
 * - Servo 3 (Wrist):    GPIO 18
 * - Servo 4 (Gripper):  GPIO 19
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ESP32Servo.h>

// --- BLE CONFIGURATION ---
#define SERVICE_UUID        "0000FFE0-0000-1000-8000-00805F9B34FB"
#define CHARACTERISTIC_UUID "0000FFE1-0000-1000-8000-00805F9B34FB"

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// --- SERVO CONFIGURATION ---
const int SERVO_BASE = 2;
const int SERVO_SHOULDER = 4;
const int SERVO_ELBOW = 5;
const int SERVO_WRIST = 18;
const int SERVO_GRIPPER = 19;
const int PIN_FSR = 34; // Analog ADC1_CH6
const int FSR_THRESHOLD = 2500; // Calibrated safe threshold

Servo servoBase;
Servo servoShoulder;
Servo servoElbow;
Servo servoWrist;
Servo servoGripper;

// Current positions
int servoPositions[5] = {90, 0, 90, 110, 110};

// --- HELPER FUNCTIONS ---

void moveServo(Servo &servo, int targetAngle) {
  targetAngle = constrain(targetAngle, 0, 180);
  servo.write(targetAngle);
}

void moveGripper(int targetAngle) {
  targetAngle = constrain(targetAngle, 0, 110);
  
  // Safety Check: Prevent closing if pressure is too high
  // Note: Assuming closing means angle decreasing or increasing? 
  // Need to know which direction is "close". Usually 0 is closed or 180 is closed.
  // Based on App.jsx: 0=Closed, 180=Open (approx) -> "setArmGripper(45)" is CLOSE.
  // So if targetAngle < currentAngle (closing) AND pressure > threshold, stop.
  
  int currentPressure = readFSR();
  if (currentPressure > FSR_THRESHOLD && targetAngle < servoGripper.read()) {
    Serial.println("Safety Stop: Gripper pressure too high!");
    return; // Ignore the command
  }
  
  servoGripper.write(targetAngle);
}

int readFSR() {
  int fsrValue = analogRead(PIN_FSR);
  return fsrValue;
}

void moveToHome() {
  servoPositions[0] = 90; // Base
  servoPositions[1] = 0; // Shoulder (Start at 0 for CW movement)
  servoPositions[2] = 180; // Elbow (Start at 180)
  servoPositions[3] = 110; // Wrist
  servoPositions[4] = 110; // Gripper

  moveServo(servoBase, servoPositions[0]);
  moveServo(servoShoulder, servoPositions[1]);
  moveServo(servoElbow, servoPositions[2]);
  moveServo(servoWrist, servoPositions[3]);
  moveGripper(servoPositions[4]);
  
  Serial.println("Moved to home position");
}

// --- BLE CALLBACKS ---

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("Device Connected");
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("Device Disconnected");
    }
};

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      String value = pCharacteristic->getValue().c_str();

      if (value.length() > 0) {
        Serial.print("Received: ");
        Serial.println(value);

        // Protocol: A:base:shoulder:elbow:wrist:gripper
        if (value.startsWith("A:")) {
          int values[5];
          int count = 0;
          int lastIndex = 2; // Skip "A:"
          
          for (int i = 0; i < 5; i++) {
            int nextIndex = value.indexOf(':', lastIndex);
            if (nextIndex == -1) nextIndex = value.length();
            
            String valStr = value.substring(lastIndex, nextIndex);
            values[i] = valStr.toInt();
            lastIndex = nextIndex + 1;
            count++;
            
            if (lastIndex > value.length()) break;
          }
          
          if (count == 5) {
             servoPositions[0] = values[0];
             servoPositions[1] = values[1];
             servoPositions[2] = values[2];
             servoPositions[3] = values[3];
             servoPositions[4] = values[4];
             
             moveServo(servoBase, servoPositions[0]);
             moveServo(servoShoulder, servoPositions[1]);
             moveServo(servoElbow, servoPositions[2]);
             moveServo(servoWrist, servoPositions[3]);
             moveGripper(servoPositions[4]);
          }
        }
      }
    }
};

// --- SETUP AND LOOP ---

void setup() {
  Serial.begin(115200);
  pinMode(PIN_FSR, INPUT); // Note: GPIO 34 does not have internal pull-up/down
  
  // --- Servo Setup ---
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);

  // Set initial positions BEFORE attaching to prevent jumps
  servoBase.setPeriodHertz(50);
  servoBase.write(servoPositions[0]);
  servoBase.attach(SERVO_BASE, 500, 2500);

  servoShoulder.setPeriodHertz(50);
  servoShoulder.write(servoPositions[1]); // Critical: Write 0 before attach
  servoShoulder.attach(SERVO_SHOULDER, 500, 2500);

  servoElbow.setPeriodHertz(50);
  servoElbow.write(servoPositions[2]); // Start at 180
  servoElbow.attach(SERVO_ELBOW, 500, 2500);

  servoWrist.setPeriodHertz(50);
  servoWrist.write(servoPositions[3]);
  servoWrist.attach(SERVO_WRIST, 500, 2500);

  servoGripper.setPeriodHertz(50);
  servoGripper.write(servoPositions[4]);
  servoGripper.attach(SERVO_GRIPPER, 500, 2500);
  
  // moveToHome(); // Already moved during setup

  // --- BLE Setup ---
  BLEDevice::init("MecanumArm"); // Different name than Base
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ   |
                      BLECharacteristic::PROPERTY_WRITE  |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );

  pCharacteristic->setCallbacks(new MyCallbacks());
  pCharacteristic->addDescriptor(new BLE2902());

  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  
  Serial.println("BLE Arm Controller Ready!");
}

void loop() {
  // Disconnection handling
  if (!deviceConnected && oldDeviceConnected) {
      delay(500); 
      pServer->startAdvertising(); 
      Serial.println("Start advertising");
      oldDeviceConnected = deviceConnected;
  }
  // Connection handling
  if (deviceConnected && !oldDeviceConnected) {
      oldDeviceConnected = deviceConnected;
  }
  
  // Calibration: Print FSR values every 500ms
  static unsigned long lastFSRTime = 0;
  if (millis() - lastFSRTime > 500) {
    lastFSRTime = millis();
    int fsr = readFSR();
    Serial.print("FSR Value: ");
    Serial.println(fsr);
  }
}

