import React, { useState, useCallback, useEffect, useRef } from 'react';
import { RotateCcw, RotateCw, Settings, Zap } from 'lucide-react';

// IMPORTANT: Replace this with the actual IP address of your ESP32 AP
const ROBOT_BASE_URL = "http://192.168.4.1";

// --- Joystick Configuration ---
const JOYSTICK_RADIUS = 120; // Radius of the outer ring in pixels

/**
 * Custom hook for sending continuous motion commands to the /move endpoint.
 */
const useMoveCommandSender = () => {
  const [vx, setVx] = useState(0);
  const [vy, setVy] = useState(0);

  // Debounced effect to send the latest VX/VY
  useEffect(() => {
    // If the robot should be stopped (Vx/Vy are near zero), send the stop command immediately
    if (Math.abs(vx) < 0.05 && Math.abs(vy) < 0.05) {
      fetch(`${ROBOT_BASE_URL}/move?vx=0&vy=0`)
        .catch(err => console.error('Stop error:', err));
      return; 
    }

    // Send the command on a recurring interval (50ms) for smooth movement
    const interval = setInterval(() => {
      fetch(`${ROBOT_BASE_URL}/move?vx=${vx.toFixed(3)}&vy=${vy.toFixed(3)}`)
        .catch(err => console.error('Move error:', err));
    }, 50); 

    return () => clearInterval(interval); // Cleanup on unmount or dependency change
  }, [vx, vy]); 
  
  const setVelocity = useCallback((newVx, newVy) => {
    setVx(newVx);
    setVy(newVy);
  }, []);

  return setVelocity;
};

// Component for the Drag Joystick
const Joystick = ({ setVelocity }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);
  
  const handleMove = useCallback((clientX, clientY) => {
    if (!isDragging || !containerRef.current) return;

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

    // Y-axis is inverted for robots: pulling down (positive Y pixel) is forward (positive Vy velocity)
    const normalizedVx = x / JOYSTICK_RADIUS;
    const normalizedVy = -y / JOYSTICK_RADIUS; 

    setVelocity(normalizedVx, normalizedVy);
  }, [isDragging, setVelocity]);

  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    const clientX = e.clientX || e.touches[0].clientX;
    const clientY = e.clientY || e.touches[0].clientY;
    handleMove(clientX, clientY);

  }, [handleMove]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setPosition({ x: 0, y: 0 });
    setVelocity(0, 0); 
  }, [setVelocity]);

  // Global mouse/touch move listeners
  useEffect(() => {
    const mouseMove = (e) => handleMove(e.clientX, e.clientY);
    const touchMove = (e) => handleMove(e.touches[0].clientX, e.touches[0].clientY);

    if (isDragging) {
      window.addEventListener('mousemove', mouseMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', touchMove);
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

  // Calculate speed percentage for display
  const distance = Math.sqrt(position.x * position.x + position.y * position.y);
  const speedPercent = Math.round((distance / JOYSTICK_RADIUS) * 100);

  return (
    <div className="flex flex-col items-center">
        <div 
          ref={containerRef}
          className="relative rounded-full border-4 border-gray-400/80 
                     bg-gray-800/80 cursor-pointer touch-none"
          style={{ width: JOYSTICK_RADIUS * 2, height: JOYSTICK_RADIUS * 2 }}
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          
          {/* Crosshair: Vertical Line */}
          <div className="absolute inset-y-0 left-1/2 w-0.5 transform -translate-x-1/2 bg-gray-400/70"></div>
          {/* Crosshair: Horizontal Line */}
          <div className="absolute inset-x-0 top-1/2 h-0.5 transform -translate-y-1/2 bg-gray-400/70"></div>
          
          {/* Center Dot (Inner Circle) - Fixed */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                          w-12 h-12 rounded-full border-2 border-gray-300/50 bg-gray-700/60 shadow-inner">
          </div>

          {/* Draggable Knob */}
          <div
            className="absolute rounded-full w-16 h-16 bg-gray-500/90 shadow-lg shadow-gray-700/50 border-2 border-white/50 transition-all duration-100 ease-linear"
            style={{
              transform: `translate(${position.x - 32}px, ${position.y - 32}px)`, // 32px is half of 64px knob size
              top: '50%',
              left: '50%',
            }}
          >
          </div>
        </div>

        {/* Speed Display */}
        <div className="mt-8 p-4 w-full text-center bg-gray-900/50 rounded-xl shadow-lg shadow-black/30 border border-gray-700/50">
          <label className="flex items-center justify-center text-xl font-semibold text-gray-300 mb-3">
            <Zap className="mr-2 h-5 w-5 text-cyan-400" />
            Throttle: <span id="speedValue" className="ml-2 text-cyan-400">{speedPercent}%</span>
          </label>
          <div className="relative h-4 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-cyan-400 to-teal-500 transition-all duration-100 ease-linear"
              style={{ width: `${speedPercent}%` }}
            ></div>
          </div>
        </div>
    </div>
  );
};


// --- App Component ---
export default function App() {
  const setVelocity = useMoveCommandSender();
  const sendCommand = useCallback((cmd) => {
    fetch(`${ROBOT_BASE_URL}/control?cmd=${cmd}`)
        .catch(err => console.error('Rotation command error:', err));
  }, []);
  
  const [rotationSpeed, setRotationSpeed] = useState(200);

  const updateRotationSpeed = (value) => {
    setRotationSpeed(value);
    fetch(`${ROBOT_BASE_URL}/speed?value=${value}`)
      .catch(err => console.error('Error setting rotation speed:', err));
  };
  
  const RotationSpeedSlider = () => (
    <div className="mt-4 p-4 bg-gray-900/50 rounded-xl shadow-lg shadow-black/30 border border-gray-700/50">
      <label className="flex items-center justify-center text-xl font-semibold text-gray-300 mb-3">
        <RotateCw className="mr-2 h-5 w-5 text-teal-400" />
        Rotation Speed: <span className="ml-2 text-cyan-400">{rotationSpeed}</span>
      </label>
      <input
        type="range"
        min="50"
        max="255"
        value={rotationSpeed}
        onChange={(e) => updateRotationSpeed(parseInt(e.target.value, 10))}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400
                   [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:shadow-cyan-400/50"
      />
      <div className="flex justify-between text-sm text-gray-400 mt-2 font-mono">
        <span>SLOW (50)</span>
        <span>FAST (255)</span>
      </div>
    </div>
  );
  
  const RotationButton = ({ icon, command }) => {
    const handleStart = () => sendCommand(command);
    const handleStop = () => sendCommand('stop');

    return (
      <button
        className="relative flex items-center justify-center p-3 sm:p-4 text-gray-200 text-3xl transition-all duration-200 ease-in-out
                    rounded-full aspect-square bg-gray-700 hover:bg-gray-600 active:bg-gray-500
                    shadow-md shadow-black/50 active:shadow-inner z-10 flex-1 h-20 w-full border border-gray-500"
        onMouseDown={handleStart}
        onMouseUp={handleStop}
        onTouchStart={handleStart}
        onTouchEnd={handleStop}
        onMouseLeave={handleStop}
      >
        <span className="text-cyan-400">
          {icon}
        </span>
      </button>
    );
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4 font-sans text-gray-200">
      <div className="max-w-md w-full bg-gray-900 p-6 md:p-8 rounded-3xl shadow-2xl shadow-black/50 border border-gray-700/50">
        <h1 className="text-3xl md:text-4xl font-extrabold text-center text-gray-400 mb-6 flex items-center justify-center">
          <Settings className="h-7 w-7 mr-2 text-teal-400" />
          Mecanum Control Console
        </h1>
        <p className="text-center text-sm text-gray-500 mb-8 max-w-xs mx-auto">
          Drag the knob to steer and accelerate omnidirectionally.
        </p>

        {/* Draggable Joystick */}
        <Joystick setVelocity={setVelocity} />

        {/* Rotation Buttons */}
        <div className="flex justify-around mt-8 gap-4">
          <RotationButton icon={<RotateCcw className="h-8 w-8" />} command="rotleft" />
          <RotationButton icon={<RotateCw className="h-8 w-8" />} command="rotright" />
        </div>
        
        <RotationSpeedSlider />

        <div className="mt-8 text-center text-xs text-gray-600 font-mono">
            <Settings className="inline h-3 w-3 mr-1 text-gray-700" />
            STATUS: Connected to {ROBOT_BASE_URL}
        </div>
      </div>
    </div>
  );
}