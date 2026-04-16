import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "./ui/SharedComponents";

export default function QRGenerator() {
  const [dept, setDept] = useState("");
  const [classroom, setClassroom] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const [qrUrl, setQrUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const [departments, setDepartments] = useState([]);
  const [classes, setClasses] = useState([]);

  const [sessionActive, setSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [activeSessionData, setActiveSessionData] = useState(null);
  const [endTime, setEndTime] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem("token");

        const deptRes = await fetch("/api/departments");
        const deptData = await deptRes.json();
        setDepartments(deptData);

        const classRes = await fetch("/api/principal/classes", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const classData = await classRes.json();
        setClasses(Array.isArray(classData) ? classData : []);

        // CHECK ACTIVE SESSION

        const sessionRes = await fetch("/api/voting-sessions/active", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const sessionData = await sessionRes.json();

        if (sessionData.active) {
          setActiveSessionData(sessionData.session);
        }
      } catch (err) {
        console.error("Failed to fetch data", err);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (!activeSessionData || classes.length === 0) return;

    const session = activeSessionData;

    setSessionActive(true);
    setSessionId(session.id);

    const generatedUrl = `${window.location.origin}/v?session=${session.id}`;

    setQrUrl(generatedUrl);

    const seconds = session.remaining_seconds;

    if (seconds <= 0) {
      setSessionActive(false);
      return;
    }

    setTimeLeft(seconds);
    setEndTime(Date.now() + seconds * 1000);

    const [deptCode, year, division] = session.division.split("-");

    setDept(deptCode.toLowerCase());
    setClassroom(`${year}-${division}`);
  }, [activeSessionData, classes]);

  const groupClassesByYear = (classList) => {
    const groups = {};

    classList.forEach((cls) => {
      if (!groups[cls.year]) {
        groups[cls.year] = [];
      }
      groups[cls.year].push(cls);
    });

    return groups;
  };

  const filteredClasses = classes.filter(
    (cls) => cls.dept.toLowerCase() === dept.toLowerCase(),
  );
  const classesByYear = groupClassesByYear(filteredClasses);

  //timer
  useEffect(() => {
    if (!sessionActive || !endTime) return;

    const interval = setInterval(() => {
      const seconds = Math.floor((endTime - Date.now()) / 1000);

      if (seconds <= 0) {
        setTimeLeft(0);
        setSessionActive(false);

        if (sessionId) {
          fetch(`/api/voting-sessions/${sessionId}/expire`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }).catch(() => {});
        }

        clearInterval(interval);
      } else {
        setTimeLeft(seconds);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionActive, endTime]);

  //timer correction
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && endTime) {
        const seconds = Math.floor((endTime - Date.now()) / 1000);
        setTimeLeft(Math.max(0, seconds));
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [endTime]);

  const handleGenerate = async () => {
    if (!dept || !classroom) return;

    setIsGenerating(true);

    try {
      const token = localStorage.getItem("token");

      const cleanClassroom = classroom.toLowerCase();
      const divKey = `${dept.toLowerCase()}-${cleanClassroom}`;

      const res = await fetch("/api/voting-sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          division: divKey,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }

      const data = await res.json();
      const sessionId = data.session_id;
      //const BASE_URL = "http://202.179.85.68:9000";
      const generatedUrl =  `${window.location.origin}/v?session=${sessionId}`;

      setQrUrl(generatedUrl);
      setTimeLeft(data.remaining_seconds);
      setEndTime(Date.now() + data.remaining_seconds * 1000);
      setSessionActive(true);
      setSessionId(sessionId);
    } catch (err) {
      alert(err.message);
      console.error("QR session creation failed", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="max-w-xl mx-auto border border-black p-8 bg-white">
      <h2 className="text-lg font-bold uppercase tracking-wide mb-6 text-center">
        Generate Voting Session
      </h2>

      <div className="space-y-4 mb-8">
        <div>
          <label className="block text-sm font-bold uppercase mb-1">
            Choose Department
          </label>
          <select
            className="w-full p-2 border border-black rounded-none focus:outline-none focus:ring-1 focus:ring-black"
            value={dept}
            disabled={sessionActive}
            onChange={(e) => {
              const selectedDept = e.target.value.toLowerCase();

              setDept(selectedDept);

              const deptClasses = classes.filter(
                (c) => c.dept.toLowerCase() === selectedDept,
              );

              if (deptClasses.length > 0) {
                const first = deptClasses[0];
                setClassroom(`${first.year}-${first.division}`);
              } else {
                setClassroom("");
              }
            }}
          >
            <option value="">Select...</option>
            {departments.map((d) => (
              <option key={d.id} value={d.code.toLowerCase()}>
                {d.code.toUpperCase()}
              </option>
            ))}
            {/* Add more departments as needed */}
          </select>
        </div>

        <div>
          <label className="block text-sm font-bold uppercase mb-1">
            Choose Classroom
          </label>
          <select
            className="w-full p-2 border border-black rounded-none focus:outline-none focus:ring-1 focus:ring-black"
            value={classroom}
            onChange={(e) => setClassroom(e.target.value)}
            disabled={sessionActive || !dept || filteredClasses.length === 0}
          >
            {!dept && <option value="">Select department first</option>}

            {dept && filteredClasses.length === 0 && (
              <option value="">No classes created</option>
            )}

            {Object.entries(classesByYear).map(([year, clsList]) => (
              <optgroup key={year} label={year}>
                {clsList.map((cls) => (
                  <option key={cls.id} value={`${cls.year}-${cls.division}`}>
                    {cls.year}-{cls.division}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={!dept || !classroom || isGenerating || sessionActive}
          className={`w-full ${sessionActive || isGenerating ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {isGenerating
            ? "Generating..."
            : sessionActive
              ? "Session Active"
              : "Generate QR Code (5 min)"}
        </Button>
      </div>

      {sessionActive && timeLeft > 0 && (
        <div className="flex flex-col items-center justify-center p-6 bg-gray-50 border border-gray-200">
          <QRCodeSVG
            value={qrUrl}
            size={200}
            fgColor="#000000"
            bgColor="#ffffff"
            level="H"
          />
          <p className="mt-4 text-xs tracking-widest uppercase text-gray-500">
            Scan to Vote
          </p>
          <div className="mt-4 text-2xl font-bold font-mono text-black">
            Time Remaining: {formatTime(timeLeft)}
          </div>
        </div>
      )}

      {sessionId && timeLeft === 0 && !sessionActive && (
        <p className="text-center text-sm text-gray-500 mt-4">
          Session expired. Generate a new QR code.
        </p>
      )}
    </div>
  );
}
