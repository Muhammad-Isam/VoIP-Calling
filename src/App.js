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
        const userStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 48000,
            sampleSize: 16,
            latency: 0,
          },
        });
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

    const ws = new WebSocket("wss://e752-108-181-186-240.ngrok-free.app");
    socketRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      if (userId) {
        ws.send(JSON.stringify({ type: "register", userId }));
      } else {
        console.error("User ID is missing before registering");
      }
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

        case "error":
          console.error(`WebSocket Error: ${data.message}`);
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
          setTimeout(() => acceptCall(data), 100);
        })
        .catch(err => {
          console.error("Failed to re-acquire microphone:", err);
          alert("Microphone access required to answer calls.");
        });
    } else {
      acceptCall(data);
    }
  };

  // Accept an incoming call and send an "answer" message including our userId
  const acceptCall = (data) => {
    const incomingPeer = new SimplePeer({
      initiator: false,
      trickle: true,
      stream: streamRef.current,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478" },
          { urls: "turn:numb.viagenie.ca", credential: "webrtc", username: "webrtc@live.com" },
        ],
      },
    });

    incomingPeer.on("signal", (signal) => {
      if (socketRef.current) {
        // Send an "answer" message with our userId to the caller
        socketRef.current.send(JSON.stringify({
          type: "answer",
          signal,
          target: data.from,
          userId: myId,
        }));
      } else {
        console.error("WebSocket not connected.");
      }
    });

    incomingPeer.on("stream", (remoteStream) => {
      console.log("Receiving remote stream...");
      // Here you can attach the remoteStream to an audio element if needed
    });

    // WebRTC Debugging Logs
    incomingPeer.on("connect", () => console.log("Peer connection established!"));
    incomingPeer.on("error", (err) => console.error("Peer error:", err));
    incomingPeer.on("close", () => console.log("Peer connection closed."));

    peerRef.current = incomingPeer;
  };

  // Start a call: send a "call" message including our userId
  const startCall = () => {
    if (!targetId) {
      alert("Please enter a user ID to call.");
      return;
    }

    const newPeer = new SimplePeer({
      initiator: true,
      trickle: true,
      stream: streamRef.current,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478" },
          { urls: "turn:numb.viagenie.ca", credential: "webrtc", username: "webrtc@live.com" },
        ],
      },
    });

    newPeer.on("signal", (signal) => {
      if (socketRef.current) {
        // Send a "call" message with our userId
        socketRef.current.send(JSON.stringify({
          type: "call",
          signal,
          target: targetId,
          userId: myId,
        }));
      } else {
        console.error("WebSocket not connected.");
      }
    });

    newPeer.on("stream", (remoteStream) => {
      console.log("Receiving remote stream...");
      // Here you can attach the remoteStream to an audio element if needed
    });

    // WebRTC Debugging Logs
    newPeer.on("connect", () => console.log("Peer connection established!"));
    newPeer.on("error", (err) => console.error("Peer error:", err));
    newPeer.on("close", () => console.log("Peer connection closed."));

    peerRef.current = newPeer;
    setCallStatus("Calling...");
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
