import { useState, useEffect } from "react";
import { Table, Modal, Button, Input } from "./ui/SharedComponents";
import SearchSelect from "./SearchSelect";

export default function RankingView() {
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedDiv, setSelectedDiv] = useState("");

  const [rankings, setRankings] = useState([]);
  const [totalVotes, setTotalVotes] = useState(0);

  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [professorName, setProfessorName] = useState("");

  const [departments, setDepartments] = useState([]);
  const [classes, setClasses] = useState([]);

  const deptClasses = classes.filter((c) => c.dept === selectedDept);

  const years = [...new Set(deptClasses.map((c) => c.year))];

  const yearClasses = deptClasses.filter((c) => c.year === selectedYear);

  const divisions = [...new Set(yearClasses.map((c) => c.division))];

  const [selectedAcademicYear, setSelectedAcademicYear] = useState("");
  const [academicYears, setAcademicYears] = useState([]);

  const [professors, setProfessors] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem("token");

        const deptRes = await fetch("/api/departments");
        const deptData = await deptRes.json();
        setDepartments(deptData);

        const classRes = await fetch("/api/principal/classes", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const classData = await classRes.json();
        setClasses(Array.isArray(classData) ? classData : []);
      } catch (err) {
        console.error("Failed to fetch ranking filters", err);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (departments.length > 0 && !selectedDept) {
      setSelectedDept(departments[0].code);
    }
  }, [departments]);

  useEffect(() => {
    setSelectedYear("");
    setSelectedDiv("");
  }, [selectedDept]);

  useEffect(() => {
    if (years.length > 0 && !selectedYear) {
      setSelectedYear(years[0]);
    }
  }, [years]);

  useEffect(() => {
    setSelectedDiv("");
  }, [selectedYear]);

  useEffect(() => {
    if (divisions.length > 0 && !selectedDiv) {
      setSelectedDiv(divisions[0]);
    }
  }, [divisions]);

  const fetchAcademicYears = async () => {
    if (!selectedDept || !selectedYear || !selectedDiv) return;

    const res = await fetch(
      `/api/academic-years?department=${selectedDept}&year=${selectedYear}&division=${selectedDiv}`,
    );

    const data = await res.json();

    setAcademicYears(data);

    if (data.length > 0 && !selectedAcademicYear) {
      setSelectedAcademicYear(data[0]);
    }
  };

  useEffect(() => {
    fetchAcademicYears();
  }, [selectedDept, selectedYear, selectedDiv]);

  const fetchRankings = async () => {
    if (!selectedDept || !selectedYear || !selectedDiv) return;

    try {
      const response = await fetch(
        `/api/results?department=${selectedDept}&year=${selectedYear}&division=${selectedDiv}&academic_year=${selectedAcademicYear}`,
      );

      const data = await response.json();

      setRankings(data.rankings);
      setTotalVotes(data.totalVotes);
    } catch (error) {
      console.error("Error fetching rankings:", error);
    }
  };

  useEffect(() => {
    if (selectedDept && selectedYear && selectedDiv && selectedAcademicYear) {
      fetchRankings();
    } else {
      setRankings([]);
      setTotalVotes(0);
    }
  }, [selectedDept, selectedYear, selectedDiv, selectedAcademicYear]);

  useEffect(() => {
    if (!selectedDept || !selectedYear || !selectedDiv) return;

    const interval = setInterval(() => {
      fetchAcademicYears(); // check if first vote created academic year
      fetchRankings(); // update rankings
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedDept, selectedYear, selectedDiv, selectedAcademicYear]);

  const fetchProfessorNames = async () => {
    const res = await fetch("/api/reports/professors");
    const data = await res.json();
    setProfessors(data);
  };

  useEffect(() => {
    fetchProfessorNames();
  }, []);

  const canDownloadReport =
    selectedDept &&
    selectedYear &&
    selectedDiv &&
    selectedAcademicYear &&
    years.length > 0 &&
    divisions.length > 0 &&
    academicYears.length > 0;

  const canDownloadProfessorReport = professorName.trim() !== "";

  return (
    <div>
      <div className="flex gap-4 mb-6 bg-gray-50 p-4 border border-gray-200">
        <div className="flex-1">
          <label className="block text-xs font-bold uppercase mb-1">
            Filter by Department
          </label>
          <select
            className="w-full p-2 border border-gray-300 focus:border-black rounded-none bg-white"
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
          >
            {departments.map((d) => (
              <option key={d.id} value={d.code}>
                {d.code.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-bold uppercase mb-1">
            Filter by Year
          </label>
          <select
            className="w-full p-2 border border-gray-300 focus:border-black rounded-none bg-white"
            value={years.length === 0 ? "" : selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            disabled={!selectedDept || years.length === 0}
          >
            {years.length === 0 && (
              <option value="">Create classes first</option>
            )}

            {years.map((y) => (
              <option key={y} value={y}>
                {y.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-bold uppercase mb-1">
            Filter by Division
          </label>
          <select
            className="w-full p-2 border border-gray-300 focus:border-black rounded-none bg-white"
            value={divisions.length === 0 ? "" : selectedDiv}
            onChange={(e) => setSelectedDiv(e.target.value)}
            disabled={!selectedYear || divisions.length === 0}
          >
            {divisions.length === 0 && (
              <option value="">Create classes first</option>
            )}

            {divisions.map((d) => (
              <option key={d} value={d}>
                {d.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-bold uppercase mb-1">
            Filter by Academic Year
          </label>

          <select
            className="w-full p-2 border border-gray-300 focus:border-black rounded-none bg-white"
            value={selectedAcademicYear}
            onChange={(e) => setSelectedAcademicYear(e.target.value)}
            disabled={!selectedDiv || academicYears.length === 0}
          >
            {academicYears.length === 0 && (
              <option value="">No data available</option>
            )}

            {academicYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold uppercase tracking-wide">
          Ranking Results
        </h2>
        <Button
          variant="primary"
          onClick={() => {
            if (!canDownloadReport) return;
            setIsDownloadModalOpen(true);
          }}
          className="text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!canDownloadReport}
        >
          Download Report
        </Button>
      </div>

      <Modal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        title="Download Report"
      >
        <div className="space-y-6">
          <div className="p-4 border border-black bg-gray-50 flex flex-col items-center">
            <p className="text-xs font-bold uppercase mb-4 text-center">
              Generate report for current selected class
            </p>
            <Button
              className="w-full"
              onClick={() => {
                const url = `/api/reports/class?department=${selectedDept}&year=${selectedYear}&division=${selectedDiv}&academic_year=${selectedAcademicYear}`;
                window.open(url, "_blank");

                setIsDownloadModalOpen(false);
              }}
            >
              Download By Class
            </Button>
          </div>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase font-bold">
              <span className="bg-white px-2 text-gray-500">OR</span>
            </div>
          </div>

          <div className="p-4 border border-black bg-gray-50">
            <SearchSelect
              label="Professor"
              items={professors}
              onSelect={(p) => setProfessorName(p.name)}
            />
            <Button
              variant="primary"
              className="w-full mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!canDownloadProfessorReport}
              onClick={() => {
                if (!canDownloadProfessorReport) return;
                const url =
                  `/api/reports/professor?` +
                  `name=${encodeURIComponent(professorName)}`;

                window.open(url, "_blank");

                setIsDownloadModalOpen(false);
                setProfessorName("");
              }}
            >
              Download By Professor
            </Button>
          </div>
        </div>
      </Modal>

      <Table
        headers={["Rank", "Teacher Name", "Subject", "Score"]}
        data={rankings || []}
        renderRow={(row, i) => (
          <tr key={i} className="hover:bg-gray-50">
            <td className="p-3 border-r border-gray-200 font-bold">
              #{row.rank}
            </td>
            <td className="p-3 border-r border-gray-200">{row.teacher}</td>
            <td className="p-3 border-r border-gray-200">{row.subject}</td>
            <td className="p-3 font-mono">{row.score} pts</td>
          </tr>
        )}
      />

      {selectedDept && selectedYear && selectedDiv && (
        <div className="text-center mt-6 text-sm font-medium text-gray-600">
          Number of students gave feedback: {totalVotes ?? 0}
        </div>
      )}

      {(!selectedDept || !selectedDiv) && (
        <p className="text-center text-gray-500 mt-8 italic text-sm">
          Please select a department and division to view rankings.
        </p>
      )}
    </div>
  );
}
