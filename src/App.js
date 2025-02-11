import React, { useEffect, useState } from "react";
import SimplePeer from "simple-peer";

const App = () => {
  const [myId, setMyId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [stream, setStream] = useState(null);
  const [callStatus, setCallStatus] = useState("Disconnected");
  const socketRef = React.useRef(null);
  const peerRef = React.useRef(null);
  const streamRef = React.useRef();

  // Request microphone access on mount
  useEffect(() => {
    const getMedia = async () => {
      try {
        const userStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setStream(userStream);
        streamRef.current = userStream;
      } catch (error) {
        console.error("Microphone access error:", error);

        if (error.name === "NotAllowedError") {
          alert("Microphone access is blocked. Please allow it in your browser settings.");
        } else if (error.name === "NotFoundError") {
          alert("No microphone detected. Connect a mic and try again.");
        } else {
          alert("Microphone error. Check browser permissions.");
        }
      }
    };

    getMedia();
  }, []);

  // Establish WebSocket connection
  useEffect(() => {
    const userId = Math.random().toString(36).substr(2, 6);
    setMyId(userId);

    // Use 'wss://' for secure WebSockets in production
    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${wsProtocol}://vo-ip-calling.vercel.app`);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      ws.send(JSON.stringify({ type: "register", userId }));
    };

    ws.onmessage = (message) => {
      const data = JSON.parse(message.data);
      console.log("Received:", data);

      switch (data.type) {
        case "registrationConfirmed":
          console.log("Registered as:", data.userId);
          break;
        case "activeUsers":
          console.log("Active users:", data.users);
          break;
        case "incomingCall":
          setCallStatus(`Incoming call from ${data.from}`);
          handleIncomingCall(data);
          break;
        case "callAccepted":
          if (peerRef.current) {
            peerRef.current.signal(data.signal);
            setCallStatus("Call connected");
          }
          break;
        case "callFailed":
          setCallStatus(`Call failed: ${data.message}`);
          break;
        default:
          console.warn("Unknown message type:", data.type);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setCallStatus("Disconnected");
    };

    return () => {
      if (ws) ws.close();
    };
  }, []);

  // Handle incoming calls
  const handleIncomingCall = (data) => {
    if (!streamRef.current) {
      console.error("No local stream available. Trying to re-acquire...");
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(userStream => {
          setStream(userStream);
          streamRef.current = userStream;
          acceptCall(data);
        })
        .catch(err => {
          console.error("Failed to re-acquire microphone:", err);
          alert("Microphone access required to answer calls.");
        });
    } else {
      acceptCall(data);
    }
  };

  const acceptCall = (data) => {
    const incomingPeer = new SimplePeer({
      initiator: false,
      trickle: false,
      stream: streamRef.current,
      config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
    });

    incomingPeer.signal(data.signal);

    incomingPeer.on("signal", (signalData) => {
      socketRef.current.send(JSON.stringify({
        type: "answer",
        signal: signalData,
        target: data.from,
      }));
    });

    incomingPeer.on("stream", (remoteStream) => {
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.play().catch((e) => console.error("Audio play failed:", e));
      setCallStatus("Call connected");
    });

    peerRef.current = incomingPeer;
  };

  // Start a call
  const startCall = () => {
    if (!streamRef.current) {
      console.error("Microphone not accessible. Please allow permissions.");
      alert("Microphone access is required to make calls.");
      return;
    }

    setCallStatus("Calling...");

    const newPeer = new SimplePeer({
      initiator: true,
      trickle: false,
      stream: streamRef.current,
      config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
    });

    newPeer.on("signal", (data) => {
      socketRef.current.send(JSON.stringify({
        type: "call",
        signal: data,
        target: targetId,
        userId: myId,
      }));
    });

    newPeer.on("stream", (remoteStream) => {
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.play().catch((e) => console.error("Audio play failed:", e));
      setCallStatus("Call connected");
    });

    peerRef.current = newPeer;
  };

  return (
    <div>
      <h1>VoIP Web App (Audio Only)</h1>
      <p>Your ID: {myId}</p>
      <p>Status: {callStatus}</p>
      <input
        type="text"
        placeholder="Enter user ID to call"
        value={targetId}
        onChange={(e) => setTargetId(e.target.value)}
      />
      <button onClick={startCall}>Call</button>
    </div>
  );
};

export default App;
