/*
 * ESP32 Mecanum Base Controller
 * WebSocket server for controlling 4 mecanum wheels
 * 
 * Commands:
 * - AUTH:<token> - Authentication
 * - PING - Heartbeat
 * - MECANUM <fl> <fr> <rl> <rr> - Set wheel speeds (-100 to 100)
 * - STOP - Emergency stop
 * 
 * Pin Configuration (L298N or similar dual H-bridge):
 * - Front Left:  IN1=16, IN2=17, EN=4
 * - Front Right: IN1=27, IN2=26, EN=25
 * - Rear Left:   IN1=22, IN2=21, EN=32
 * - Rear Right:  IN1=19, IN2=18, EN=5
 * 
 * FIXED: Corrected PWM channel usage for ESP32 core 3.x
 */

 #include <WiFi.h>
 #include <WebSocketsServer.h>
 #include <WebServer.h>
 
 // WiFi credentials
 const char* ssid = "redmi";
 const char* password = "1234567890";
 const char* authToken = "mysecret";
 
 // WebSocket server
 WebSocketsServer webSocket = WebSocketsServer(81);
 WebServer server(80);
 
 // Motor pins (IN1, IN2 for direction, EN for PWM/Enable)
 // L298N or similar dual H-bridge motor driver
 const int M1_IN1 = 16;  // Front Left IN1
 const int M1_IN2 = 17;  // Front Left IN2
 const int M1_EN = 4;    // Front Left Enable/PWM
 
 const int M2_IN1 = 27;  // Front Right IN1
 const int M2_IN2 = 26;  // Front Right IN2
 const int M2_EN = 25;   // Front Right Enable/PWM
 
 const int M3_IN1 = 22;  // Rear Left IN1
 const int M3_IN2 = 21;  // Rear Left IN2
 const int M3_EN = 32;   // Rear Left Enable/PWM
 
 const int M4_IN1 = 19;  // Rear Right IN1
 const int M4_IN2 = 18;  // Rear Right IN2
 const int M4_EN = 5;    // Rear Right Enable/PWM
 
 // PWM settings
 const int PWM_FREQ = 5000;
 const int PWM_RESOLUTION = 8; // 8-bit = 0-255
 
 bool authenticated = false;
 unsigned long lastPing = 0;
 const unsigned long PING_TIMEOUT = 10000; // 10 seconds
 
 void setup() {
   Serial.begin(115200);
   delay(2000);
   
   Serial.println("\n\n=================================");
   Serial.println("ESP32 Mecanum Base Controller");
   Serial.println("=================================");
 
   // Setup motor pins
   Serial.println("Initializing motors...");
   setupMotors();
   Serial.println("Motors initialized!");
 
   // Setup WiFi - Station Mode Only
   Serial.println("\nConnecting to WiFi...");
   Serial.print("SSID: ");
   Serial.println(ssid);
   
   WiFi.mode(WIFI_STA);
   WiFi.begin(ssid, password);
   
   int attempts = 0;
   while (WiFi.status() != WL_CONNECTED && attempts < 20) {
     delay(500);
     Serial.print(".");
     attempts++;
   }
   Serial.println();
   
   IPAddress IP;
   if (WiFi.status() == WL_CONNECTED) {
     Serial.println("✓ WiFi connected successfully!");
     IP = WiFi.localIP();
     Serial.print("✓ IP Address: ");
     Serial.println(IP);
     Serial.print("✓ Signal Strength: ");
     Serial.print(WiFi.RSSI());
     Serial.println(" dBm");
   } else {
     Serial.println("✗ Failed to connect to WiFi!");
     Serial.println("✗ Check SSID and password!");
     while(1) { delay(1000); } // Halt if connection fails
   }
 
   // WebSocket event handler
   Serial.println("\nStarting WebSocket server on port 81...");
   webSocket.onEvent(webSocketEvent);
   webSocket.begin();
   Serial.println("✓ WebSocket server started!");
 
   // HTTP server for status
   Serial.println("Starting HTTP server on port 80...");
   server.on("/", [](){
     server.send(200, "text/html", 
       "<html><body><h1>ESP32 Mecanum Base</h1><p>WebSocket on port 81</p></body></html>");
   });
   server.begin();
   Serial.println("✓ HTTP server started!");
 
   Serial.println("\n=================================");
   Serial.println("✓ SYSTEM READY!");
   Serial.println("=================================");
   Serial.print("Connect to WebSocket: ws://");
   Serial.print(IP);
   Serial.println(":81");
   Serial.print("Web Interface: http://");
   Serial.println(IP);
   Serial.println("=================================\n");
 }
 
 void loop() {
   webSocket.loop();
   server.handleClient();
 
   // Check for timeout
   if (authenticated && (millis() - lastPing > PING_TIMEOUT)) {
     Serial.println("Connection timeout, stopping motors");
     stopAllMotors();
     authenticated = false;
   }
 }
 
 void setupMotors() {
   // Setup PWM using ESP32 core 3.x API (ledcAttach)
   ledcAttach(M1_EN, PWM_FREQ, PWM_RESOLUTION);
   ledcAttach(M2_EN, PWM_FREQ, PWM_RESOLUTION);
   ledcAttach(M3_EN, PWM_FREQ, PWM_RESOLUTION);
   ledcAttach(M4_EN, PWM_FREQ, PWM_RESOLUTION);
 
   // Setup direction pins (IN1, IN2) as outputs
   pinMode(M1_IN1, OUTPUT);
   pinMode(M1_IN2, OUTPUT);
   pinMode(M2_IN1, OUTPUT);
   pinMode(M2_IN2, OUTPUT);
   pinMode(M3_IN1, OUTPUT);
   pinMode(M3_IN2, OUTPUT);
   pinMode(M4_IN1, OUTPUT);
   pinMode(M4_IN2, OUTPUT);
 
   // Initialize motors to stop
   stopAllMotors();
 }
 
 void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
   switch(type) {
     case WStype_DISCONNECTED:
       Serial.printf("[%u] Disconnected\n", num);
       authenticated = false;
       stopAllMotors();
       break;
 
     case WStype_CONNECTED:
       {
         IPAddress ip = webSocket.remoteIP(num);
         Serial.printf("[%u] Connected from %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
         authenticated = false;
       }
       break;
 
     case WStype_TEXT:
       {
         String message = String((char*)payload);
         Serial.printf("[%u] Received: %s\n", num, message.c_str());
         
         // Handle authentication
         if (message.startsWith("AUTH:")) {
           String token = message.substring(5);
           if (token == authToken) {
             authenticated = true;
             lastPing = millis();
             webSocket.sendTXT(num, "AUTH_OK");
             Serial.println("Authentication successful");
           } else {
             webSocket.sendTXT(num, "AUTH_FAIL");
             Serial.println("Authentication failed");
           }
           return;
         }
 
         // Check authentication
         if (!authenticated) {
           webSocket.sendTXT(num, "NOT_AUTHENTICATED");
           return;
         }
 
         // Handle PING
         if (message == "PING") {
           lastPing = millis();
           webSocket.sendTXT(num, "PONG");
           return;
         }
 
         // Handle MECANUM command
         if (message.startsWith("MECANUM ")) {
           int fl, fr, rl, rr;
           if (sscanf(message.c_str(), "MECANUM %d %d %d %d", &fl, &fr, &rl, &rr) == 4) {
             setMotorSpeed(M1_IN1, M1_IN2, M1_EN, fl);  // Front Left
             setMotorSpeed(M2_IN1, M2_IN2, M2_EN, fr);  // Front Right
             setMotorSpeed(M3_IN1, M3_IN2, M3_EN, rl);  // Rear Left
             setMotorSpeed(M4_IN1, M4_IN2, M4_EN, rr);  // Rear Right
             webSocket.sendTXT(num, "OK");
           } else {
             webSocket.sendTXT(num, "ERROR: Invalid format");
           }
           return;
         }
 
         // Handle STOP command
         if (message == "STOP") {
           stopAllMotors();
           webSocket.sendTXT(num, "STOPPED");
           return;
         }
 
         webSocket.sendTXT(num, "UNKNOWN_COMMAND");
       }
       break;
 
     default:
       break;
   }
 }
 
 void setMotorSpeed(int in1Pin, int in2Pin, int enPin, int speed) {
   // Clamp speed to -100 to 100
   speed = constrain(speed, -100, 100);
   
   // Set direction using IN1 and IN2
   if (speed > 0) {
     // Forward: IN1 = HIGH, IN2 = LOW
     digitalWrite(in1Pin, HIGH);
     digitalWrite(in2Pin, LOW);
   } else if (speed < 0) {
     // Reverse: IN1 = LOW, IN2 = HIGH
     digitalWrite(in1Pin, LOW);
     digitalWrite(in2Pin, HIGH);
   } else {
     // Stop: IN1 = LOW, IN2 = LOW
     digitalWrite(in1Pin, LOW);
     digitalWrite(in2Pin, LOW);
   }
   
   // Set PWM on Enable pin (0-255)
   // In ESP32 core 3.x, ledcWrite uses the pin number directly
   int pwmValue = map(abs(speed), 0, 100, 0, 255);
   ledcWrite(enPin, pwmValue);
 }
 
 void stopAllMotors() {
   // Stop all motors by setting PWM to 0 and IN1/IN2 to LOW
   ledcWrite(M1_EN, 0);
   ledcWrite(M2_EN, 0);
   ledcWrite(M3_EN, 0);
   ledcWrite(M4_EN, 0);
   
   // Set all direction pins to LOW
   digitalWrite(M1_IN1, LOW);
   digitalWrite(M1_IN2, LOW);
   digitalWrite(M2_IN1, LOW);
   digitalWrite(M2_IN2, LOW);
   digitalWrite(M3_IN1, LOW);
   digitalWrite(M3_IN2, LOW);
   digitalWrite(M4_IN1, LOW);
   digitalWrite(M4_IN2, LOW);
 }