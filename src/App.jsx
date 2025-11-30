import React, { useState, useCallback, useEffect, useRef } from 'react';
import { RotateCcw, RotateCw, Settings, Zap, Bluetooth, BluetoothConnected, BluetoothOff, Gamepad2, Hand, Maximize, Minimize, Home } from 'lucide-react';

// --- BLE Configuration ---
const SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
const CHARACTERISTIC_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb";

// --- Joystick Configuration ---
const JOYSTICK_RADIUS = 80; // Reduced radius to fit two joysticks

/**
 * Reusable hook for managing a Bluetooth connection.
 */
const useBluetoothController = (deviceName) => {
  const [device, setDevice] = useState(null);
  const [characteristic, setCharacteristic] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);

  const connect = async () => {
    try {
      setError(null);
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: deviceName }],
        optionalServices: [SERVICE_UUID]
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      const char = await service.getCharacteristic(CHARACTERISTIC_UUID);

      device.addEventListener('gattserverdisconnected', onDisconnected);

      setDevice(device);
      setCharacteristic(char);
      setIsConnected(true);
      console.log(`Connected to ${deviceName}`);
    } catch (err) {
      console.error(`Connection to ${deviceName} failed`, err);
      setError(err.message);
    }
  };

  const disconnect = () => {
    if (device && device.gatt.connected) {
      device.gatt.disconnect();
    }
  };

  const onDisconnected = () => {
    console.log(`Device ${deviceName} disconnected`);
    setIsConnected(false);
    setDevice(null);
    setCharacteristic(null);
  };

  const sendCommand = useCallback(async (cmd) => {
    if (!characteristic) return;
    try {
      const encoder = new TextEncoder();
      await characteristic.writeValue(encoder.encode(cmd));
    } catch (err) {
      console.error(`Send error to ${deviceName}:`, err);
    }
  }, [characteristic, deviceName]);

  return { connect, disconnect, isConnected, sendCommand, error };
};

// Component for the Drag Joystick
const Joystick = ({ setVelocity, label, color = "cyan", sticky = false }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);
  const touchIdRef = useRef(null); // Track specific touch ID

  const handleMove = useCallback((clientX, clientY) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let x = clientX - centerX;
    let y = clientY - centerY;

    let r = Math.sqrt(x * x + y * y);

    if (r > JOYSTICK_RADIUS) {
      x = (x / r) * JOYSTICK_RADIUS;
      y = (y / r) * JOYSTICK_RADIUS;
      r = JOYSTICK_RADIUS;
    }

    setPosition({ x, y });

    // Normalize to -1.0 to 1.0
    const normalizedX = x / JOYSTICK_RADIUS;
    const normalizedY = -y / JOYSTICK_RADIUS; // Invert Y

    setVelocity(normalizedX, normalizedY);
  }, [setVelocity]);

  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);

    let clientX, clientY;
    if (e.type === 'touchstart') {
      const touch = e.changedTouches[0];
      touchIdRef.current = touch.identifier;
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    handleMove(clientX, clientY);
  }, [handleMove]);

  const handleDragEnd = useCallback((e) => {
    // For touch, only end if the ending touch matches our tracked ID
    if (e.type === 'touchend' || e.type === 'touchcancel') {
      const touch = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current);
      if (!touch) return; // Not our touch
      touchIdRef.current = null;
    }

    setIsDragging(false);
    if (!sticky) {
      setPosition({ x: 0, y: 0 });
      setVelocity(0, 0);
    }
  }, [setVelocity, sticky]);

  // Global mouse/touch move listeners
  useEffect(() => {
    const mouseMove = (e) => {
      if (isDragging && touchIdRef.current === null) {
        handleMove(e.clientX, e.clientY);
      }
    };

    const touchMove = (e) => {
      if (isDragging && touchIdRef.current !== null) {
        const touch = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current);
        if (touch) {
          handleMove(touch.clientX, touch.clientY);
        }
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', mouseMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', touchMove, { passive: false });
      window.addEventListener('touchend', handleDragEnd);
      window.addEventListener('touchcancel', handleDragEnd);
    }

    return () => {
      window.removeEventListener('mousemove', mouseMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('touchend', handleDragEnd);
      window.removeEventListener('touchcancel', handleDragEnd);
    };
  }, [isDragging, handleMove, handleDragEnd]);

  const borderColor = color === "cyan" ? "border-cyan-400/50" : "border-purple-400/50";
  const knobColor = color === "cyan" ? "bg-cyan-500/90" : "bg-purple-500/90";

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 text-gray-400 font-bold text-sm tracking-wider">{label}</div>
      <div
        ref={containerRef}
        className={`relative rounded-full border-4 ${borderColor}
                     bg-gray-800/80 cursor-pointer touch-none shadow-inner shadow-black/50`}
        style={{ width: JOYSTICK_RADIUS * 2, height: JOYSTICK_RADIUS * 2 }}
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
      >
        {/* Draggable Knob */}
        <div
          className={`absolute rounded-full w-12 h-12 ${knobColor} shadow-lg shadow-black/50 border-2 border-white/30 transition-all duration-75 ease-linear`}
          style={{
            transform: `translate(${position.x - 24}px, ${position.y - 24}px)`,
            top: '50%',
            left: '50%',
          }}
        >
        </div>
      </div>
    </div>
  );
};

// --- App Component ---
export default function App() {
  // --- Orientation Logic ---
  const [isPortrait, setIsPortrait] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };

    const checkFullscreen = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    // Initial check
    checkOrientation();
    checkFullscreen();

    // Listen for resize/orientation change
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    document.addEventListener('fullscreenchange', checkFullscreen);

    // Attempt to lock orientation (works mostly in Fullscreen/PWA)
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(err => {
        // Expected error on some browsers/devices if not fullscreen
        console.log("Orientation lock failed (expected if not fullscreen):", err);
      });
    }

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
      document.removeEventListener('fullscreenchange', checkFullscreen);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.log(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // --- Base Controller ---
  const baseBle = useBluetoothController('MecanumRobot');
  const [baseVx, setBaseVx] = useState(0);
  const [baseVy, setBaseVy] = useState(0);
  const [rotationSpeed, setRotationSpeed] = useState(200);

  // --- Arm Controller ---
  const armBle = useBluetoothController('MecanumArm');
  const [armBase, setArmBase] = useState(90);
  const [armBaseVelocity, setArmBaseVelocity] = useState(0); // -100 to 100
  const [armShoulder, setArmShoulder] = useState(0);  // Independent Shoulder (Start at 0)
  const [armElbow, setArmElbow] = useState(180);      // Independent Elbow (Start at 180)
  const [armWrist, setArmWrist] = useState(110);
  const [armWristVelocity, setArmWristVelocity] = useState(0); // -100 to 100
  const [armGripper, setArmGripper] = useState(110); // 0 = Closed, 180 = Open (approx)

  const [gripperAction, setGripperAction] = useState('idle'); // 'idle', 'opening', 'closing'
  const [isHoming, setIsHoming] = useState(false);

  // Home Positions
  const HOME_POSITIONS = {
    base: 90,
    shoulder: 0,
    elbow: 180,
    wrist: 110,
    gripper: 110
  };

  // Gripper Hold-to-Move Logic
  useEffect(() => {
    if (gripperAction === 'idle') return;

    const interval = setInterval(() => {
      setArmGripper(prev => {
        const step = 2; // Speed: 2 degrees per 50ms
        let next = prev;
        if (gripperAction === 'opening') next += step;
        if (gripperAction === 'closing') next -= step;
        return Math.max(0, Math.min(110, next));
      });
    }, 50);

    return () => clearInterval(interval);
  }, [gripperAction]);



  // --- Base Logic ---
  useEffect(() => {
    if (!baseBle.isConnected) return;

    if (Math.abs(baseVx) < 0.05 && Math.abs(baseVy) < 0.05) {
      baseBle.sendCommand(`M:0:0`);
      const stopInterval = setInterval(() => baseBle.sendCommand(`M:0:0`), 50);
      const timeout = setTimeout(() => clearInterval(stopInterval), 500);
      return () => { clearInterval(stopInterval); clearTimeout(timeout); };
    }

    const interval = setInterval(() => {
      baseBle.sendCommand(`M:${baseVx.toFixed(3)}:${baseVy.toFixed(3)}`);
    }, 50);

    return () => clearInterval(interval);
  }, [baseBle.isConnected, baseVx, baseVy, baseBle.sendCommand]);

  const updateRotationSpeed = (value) => {
    setRotationSpeed(value);
    if (baseBle.isConnected) baseBle.sendCommand(`S:${value}`);
  };

  // --- Arm Logic ---
  // State for Arm Joystick Velocity (not Angle)
  const [armVx, setArmVx] = useState(0);
  const [armVy, setArmVy] = useState(0);

  // Refs for State Access inside Loop (to avoid restarting interval)
  const stateRef = useRef({
    armBase, armBaseVelocity, armShoulder, armElbow, armWrist, armWristVelocity, armGripper, armVx, armVy, isHoming
  });

  // Sync Refs with State
  useEffect(() => {
    stateRef.current = { armBase, armBaseVelocity, armShoulder, armElbow, armWrist, armWristVelocity, armGripper, armVx, armVy, isHoming };
  }, [armBase, armBaseVelocity, armShoulder, armElbow, armWrist, armWristVelocity, armGripper, armVx, armVy, isHoming]);

  // Main Control Loop (Runs once, doesn't restart on state changes)
  useEffect(() => {
    if (!armBle.isConnected) return;

    const interval = setInterval(() => {
      const { armBase, armBaseVelocity, armShoulder, armElbow, armWrist, armWristVelocity, armGripper, armVx, armVy, isHoming } = stateRef.current;

      // Incremental Control with Variable Speed (Exponential Curve)
      const MAX_SPEED = 5.0;

      // --- HOMING LOGIC ---
      if (isHoming) {
        const HOMING_SPEED = 3.0; // Degrees per tick
        let reachedHome = true;

        // Helper to move towards target
        const moveTowards = (current, target, speed) => {
          if (Math.abs(current - target) < speed) return target;
          reachedHome = false;
          return current < target ? current + speed : current - speed;
        };

        setArmBase(prev => moveTowards(prev, HOME_POSITIONS.base, HOMING_SPEED));
        setArmShoulder(prev => moveTowards(prev, HOME_POSITIONS.shoulder, HOMING_SPEED));
        setArmElbow(prev => moveTowards(prev, HOME_POSITIONS.elbow, HOMING_SPEED));
        setArmWrist(prev => moveTowards(prev, HOME_POSITIONS.wrist, HOMING_SPEED));
        setArmGripper(prev => moveTowards(prev, HOME_POSITIONS.gripper, HOMING_SPEED));

        if (reachedHome) setIsHoming(false);

        // Skip manual control if homing
        // Send current angles to robot
        const servoShoulder = 70 - Math.round(armShoulder); // Inverted Output
        const cmd = `A:${Math.round(armBase)}:${servoShoulder}:${Math.round(armElbow)}:${armWrist}:${armGripper}`;
        armBle.sendCommand(cmd);
        return;
      }

      // --- MANUAL CONTROL ---

      // 1. Base Rotation (Velocity Control)
      if (Math.abs(armBaseVelocity) > 5) {
        const baseSpeed = (armBaseVelocity / 100) * MAX_SPEED;
        setArmBase(prev => Math.max(0, Math.min(180, prev + baseSpeed)));
      }

      // 2. Wrist Rotation (Velocity Control)
      if (Math.abs(armWristVelocity) > 5) {
        const wristSpeed = (armWristVelocity / 100) * MAX_SPEED;
        setArmWrist(prev => Math.max(0, Math.min(110, prev + wristSpeed)));
      }

      // 3. Arm Joints (Joystick Control)
      if (Math.abs(armVx) > 0.05 || Math.abs(armVy) > 0.05) {
        // Joystick X -> Shoulder (0 to 70)
        // Right (Positive X) -> Increase Angle
        const deltaShoulder = armVx * Math.abs(armVx) * MAX_SPEED;
        setArmShoulder(prev => {
          const next = prev + deltaShoulder;
          return Math.max(0, Math.min(70, next));
        });

        // Joystick Y -> Elbow (0 to 180)
        // Up (Negative Y) -> Increase Angle (Lift)
        const deltaElbow = -armVy * Math.abs(armVy) * MAX_SPEED;
        setArmElbow(prev => {
          const next = prev + deltaElbow;
          return Math.max(0, Math.min(180, next));
        });
      }

      // Send current angles to robot
      // Note: Check servo mounting direction.
      // Shoulder Inverted: UI 0 -> Servo 70, UI 70 -> Servo 0
      const servoShoulder = 70 - Math.round(armShoulder);
      const cmd = `A:${Math.round(armBase)}:${servoShoulder}:${Math.round(armElbow)}:${armWrist}:${armGripper}`;
      armBle.sendCommand(cmd);

    }, 50); // 20Hz update rate

    return () => clearInterval(interval);
  }, [armBle.isConnected, armBle.sendCommand]); // Only restart if connection changes

  // Handle Arm Joystick now sets Velocity, not Angle
  const handleArmJoystick = (x, y) => {
    if (Math.abs(x) > 0.05 || Math.abs(y) > 0.05) setIsHoming(false); // Cancel Homing
    setArmVx(x);
    setArmVy(y);
  };

  const constrain = (val, min, max) => Math.min(Math.max(val, min, max));

  const RotationButton = ({ icon, command }) => {
    const handleStart = () => { if (baseBle.isConnected) baseBle.sendCommand(`C:${command}`); };
    const handleStop = () => { if (baseBle.isConnected) baseBle.sendCommand('C:stop'); };
    return (
      <button
        className={`p-4 rounded-full bg-gray-700 hover:bg-gray-600 active:bg-gray-500 shadow-lg transition-all
                    ${!baseBle.isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
        onMouseDown={handleStart} onMouseUp={handleStop}
        onTouchStart={handleStart} onTouchEnd={handleStop}
        disabled={!baseBle.isConnected}
      >
        <span className="text-cyan-400">{icon}</span>
      </button>
    );
  };

  if (isPortrait) {
    return (
      <div className="w-screen h-screen bg-black flex flex-col items-center justify-center text-center p-8 text-white">
        <RotateCcw className="w-16 h-16 mb-4 animate-spin-slow text-cyan-400" />
        <h1 className="text-2xl font-bold mb-2">Please Rotate Device</h1>
        <p className="text-gray-400">This controller is designed for landscape mode.</p>
      </div>
    );
  }

  return (
    <div className="w-screen h-[100dvh] bg-gray-950 overflow-hidden flex flex-row items-center justify-between px-12 select-none touch-none">

      {/* LEFT: Base Joystick (Clean) */}
      <div className="flex flex-col items-center justify-center w-1/4">
        <Joystick
          label="MOVE"
          color="cyan"
          setVelocity={(vx, vy) => { setBaseVx(vx); setBaseVy(vy); }}
        />
      </div>

      {/* CENTER: Controls & Status */}
      <div className="flex flex-col items-center justify-center w-2/4 h-full py-6 gap-6">

        {/* Top Row: Connections & Speed */}
        <div className="flex items-center gap-6 w-full justify-center bg-gray-900/50 p-3 rounded-2xl border border-gray-800/50">
          <button
            onClick={baseBle.isConnected ? baseBle.disconnect : baseBle.connect}
            className={`p-2 rounded-lg transition-all ${baseBle.isConnected ? 'bg-green-600/20 text-green-400' : 'bg-gray-800 text-gray-500'}`}
          >
            <Gamepad2 className="h-5 w-5" />
          </button>

          {/* Home Button */}
          <button
            onClick={() => setIsHoming(true)}
            className={`p-2 rounded-lg transition-all ${isHoming ? 'bg-cyan-600/20 text-cyan-400 animate-pulse' : 'bg-gray-800 text-gray-500 hover:text-cyan-400'}`}
          >
            <Home className="h-5 w-5" />
          </button>

          {/* Speed Slider */}
          <div className="flex-1 max-w-[120px] flex items-center gap-2">
            <Zap className="h-3 w-3 text-yellow-500" />
            <input
              type="range" min="50" max="255" value={rotationSpeed}
              onChange={(e) => updateRotationSpeed(parseInt(e.target.value))}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
            />
          </div>

          <button
            onClick={armBle.isConnected ? armBle.disconnect : armBle.connect}
            className={`p-2 rounded-lg transition-all ${armBle.isConnected ? 'bg-purple-600/20 text-purple-400' : 'bg-gray-800 text-gray-500'}`}
          >
            <Hand className="h-5 w-5" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-gray-800 text-gray-500 hover:text-cyan-400 transition-all"
          >
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>

        {/* Middle: Base & Wrist Sliders */}
        <div className="w-full max-w-sm flex flex-col gap-4 bg-gray-900/50 p-4 rounded-2xl border border-gray-800/50">
          {/* Base Slider (Velocity Control) */}
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1 font-mono tracking-wider">
              <span>BASE ROTATION</span>
              <span>{Math.round(armBase)}°</span>
            </div>
            <input
              type="range" min="-100" max="100" value={armBaseVelocity}
              onChange={(e) => { setArmBaseVelocity(parseInt(e.target.value)); setIsHoming(false); }}
              onMouseUp={() => setArmBaseVelocity(0)}
              onTouchEnd={() => setArmBaseVelocity(0)}
              className="w-full h-4 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
          </div>

          {/* Wrist Slider (Velocity Control) */}
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1 font-mono tracking-wider">
              <span>WRIST ANGLE</span>
              <span>{Math.round(armWrist)}°</span>
            </div>
            <input
              type="range" min="-100" max="100" value={armWristVelocity}
              onChange={(e) => { setArmWristVelocity(parseInt(e.target.value)); setIsHoming(false); }}
              onMouseUp={() => setArmWristVelocity(0)}
              onTouchEnd={() => setArmWristVelocity(0)}
              className="w-full h-4 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-400"
            />
          </div>
        </div>

        {/* Bottom: Rotation & Gripper */}
        <div className="w-full max-w-sm flex gap-4">

          {/* Rotation (Base - Left Side) */}
          <div className="flex gap-2">
            <div className="flex flex-col gap-2">
              <RotationButton icon={<RotateCcw className="h-5 w-5" />} command="rotleft" />
            </div>
            <div className="flex flex-col gap-2">
              <RotationButton icon={<RotateCw className="h-5 w-5" />} command="rotright" />
            </div>
          </div>

          {/* Gripper (Arm - Right Side) */}
          <div className="flex-1 flex gap-2">
            <button
              onMouseDown={() => setGripperAction('closing')}
              onMouseUp={() => setGripperAction('idle')}
              onMouseLeave={() => setGripperAction('idle')}
              onTouchStart={() => setGripperAction('closing')}
              onTouchEnd={() => setGripperAction('idle')}
              className={`flex-1 py-4 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-lg flex flex-col items-center justify-center gap-1
                ${gripperAction === 'closing' ? 'bg-purple-500 text-white shadow-purple-500/50' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}
            >
              <span>OPEN</span>
            </button>
            <button
              onMouseDown={() => setGripperAction('opening')}
              onMouseUp={() => setGripperAction('idle')}
              onMouseLeave={() => setGripperAction('idle')}
              onTouchStart={() => setGripperAction('opening')}
              onTouchEnd={() => setGripperAction('idle')}
              className={`flex-1 py-4 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-lg flex flex-col items-center justify-center gap-1
                ${gripperAction === 'opening' ? 'bg-purple-500 text-white shadow-purple-500/50' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}
            >
              <span>CLOSE</span>
            </button>
          </div>

        </div>

      </div>

      {/* RIGHT: Arm Joystick */}
      <div className="flex flex-col items-center justify-center w-1/4">
        <Joystick
          label="ARM"
          color="purple"
          setVelocity={handleArmJoystick}
        />
        <div className="mt-4 text-[10px] text-gray-600 font-mono flex gap-3">
          <span>S:{Math.round(armShoulder)}</span>
          <span>E:{Math.round(armElbow)}</span>
        </div>
      </div>

    </div>
  );
}