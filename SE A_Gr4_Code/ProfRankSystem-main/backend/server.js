require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const authenticate = require("./middleware/auth");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const nodemailer = require("nodemailer");

const app = express();
app.use((req, res, next) => {
  console.log(`Incoming ${req.method} ${req.url}`);
  next();
});
const cors = require("cors");
const { types } = require("util");
const { link } = require("pdfkit/js/pdfkit.standalone");
const resetCooldown = new Map();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((err, success) => {
  if (err) {
    console.error("Email config error:", err);
  } else {
    console.log("Email server ready");
  }
});

//funcs
function generatePassword() {
  return crypto.randomBytes(2).toString("hex");
}

function compBordaScores(votes) {
  const S = {};
  const V = {};

  votes.forEach((vote) => {
    const rankingArray =
      typeof vote.rankings === "string"
        ? JSON.parse(vote.rankings)
        : vote.rankings;

    const totalTeachers = rankingArray.length;

    rankingArray.forEach((linkingId, index) => {
      linkingId = Number(linkingId);
      const points = totalTeachers - index - 1;

      if (S[linkingId] === undefined) {
        S[linkingId] = 0;
        V[linkingId] = 0;
      }

      S[linkingId] += points;
      V[linkingId] += 1;
    });
  });
  return { S, V };
}

function compWeightedBorda(S, V) {
  const ids = Object.keys(S);

  const x = {};
  ids.forEach((id) => {
    x[id] = S[id] / V[id];
  });

  const C = ids.reduce((sum, id) => sum + x[id], 0) / ids.length;

  const Vs = Object.values(V).sort((a, b) => a - b);

  let median;
  const n = Vs.length;
  if (n % 2 === 0) {
    median = (Vs[n / 2 - 1] + Vs[n / 2]) / 2;
  } else {
    median = Vs[Math.floor(n / 2)];
  }

  const m = 0.5 * median;

  const Ws = {};

  ids.forEach((id) => {
    Ws[id] = (S[id] + m * C) / (V[id] + m);
  });

  return Ws;
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

//login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  console.log("LOGIN ATTEMPT:", username, password);
  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required" });
  }

  const sql = `
        SELECT u.id, u.password_hash, u.role, d.code AS dept
        FROM users u
        LEFT JOIN depts d ON u.dept_id = d.id
        WHERE u.username = ?
        LIMIT 1
    `;

  db.query(sql, [username], async (err, results) => {
    if (err) return res.status(500).json({ message: "DB error" });

    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = results[0];

    const match = await bcrypt.compare(password, user.password_hash);
    console.log("MATCH:", match);
    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        role: user.role,
        dept: user.dept,
      },
      process.env.JWT_SECRET,
      { expiresIn: "2h" },
    );

    res.json({
      token,
      role: user.role,
      dept: user.dept,
    });
  });
});

// GET all departments
app.get("/api/departments", (req, res) => {
  const sql = `
    SELECT 
      d.id,
      d.code,
      u.username
    FROM depts d
    LEFT JOIN users u 
      ON u.dept_id = d.id AND u.role='DEPT_ADMIN'
    ORDER BY d.code
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching departments:", err);
      return res.status(500).json({ message: "Database error" });
    }

    res.json(results);
  });
});

// POST to add or update a department
app.post("/api/departments", (req, res) => {
  const { id, name, username } = req.body; // 'name' from frontend maps to 'code' in DB

  if (id) {
    const updateDept = "UPDATE depts SET code = ? WHERE id = ?";

    db.query(updateDept, [name, id], (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "Department update failed" });
      }

      const updateUser = `
      UPDATE users
      SET username = ?
      WHERE dept_id = ? AND role = 'DEPT_ADMIN'
    `;

      db.query(updateUser, [username, id], (err2) => {
        if (err2) {
          if (err2.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
              message: "Username already exists",
            });
          }

          console.error(err2);
          return res.status(500).json({
            message: "Username update failed",
          });
        }

        res.json({
          message: "Department updated successfully",
        });
      });
    });
  } else {
    if (!username) {
      return res.status(400).json({ message: "Username required" });
    }

    try {
      const insertDept = "INSERT INTO depts (code) VALUES (UPPER(?))";

      db.query(insertDept, [name], async (err, result) => {
        if (err) {
          console.error(err);
          return res
            .status(500)
            .json({ message: "Department creation failed" });
        }

        const deptId = result.insertId;

        // generate random temporary password
        const tempPassword = generatePassword();

        // hash password
        const hash = await bcrypt.hash(tempPassword, 10);

        const insertUser = `
        INSERT INTO users (username,password_hash,role,dept_id)
        VALUES (?,?, 'DEPT_ADMIN', ?)
      `;

        db.query(insertUser, [username, hash, deptId], (err2) => {
          if (err2) {
            if (err2.code === "ER_DUP_ENTRY") {
              return res.status(409).json({
                message: "Username already exists",
              });
            }

            console.error(err2);
            return res.status(500).json({
              message: "User creation failed",
            });
          }

          res.json({
            message: "Department and HOD created",
            username,
            tempPassword,
          });
        });
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error" });
    }
  }
});

// DELETE a department by ID
app.delete("/api/departments/:id", (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM depts WHERE id = ?";

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Delete error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json({ message: "Deleted successfully" });
  });
});

//reset password HOD
app.post("/api/departments/:id/reset-password", async (req, res) => {
  const { id } = req.params;

  try {
    const tempPassword = generatePassword();
    const hash = await bcrypt.hash(tempPassword, 10);

    const sql = `
      UPDATE users
      SET password_hash = ?
      WHERE dept_id = ? AND role='DEPT_ADMIN'
    `;

    db.query(sql, [hash, id], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "DB error" });
      }

      res.json({
        message: "Password reset successful",
        tempPassword,
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

//change password
app.post("/api/change-password", authenticate, async (req, res) => {
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 4) {
    return res
      .status(400)
      .json({ message: "Password must be at least 4 characters" });
  }

  try {
    const hash = await bcrypt.hash(newPassword, 10);

    const sql = `
      UPDATE users
      SET password_hash = ?
      WHERE role = ?
      ${req.user.role === "DEPT_ADMIN" ? "AND dept_id = (SELECT id FROM depts WHERE code = ?)" : ""}
    `;

    const params =
      req.user.role === "DEPT_ADMIN"
        ? [hash, req.user.role, req.user.dept]
        : [hash, req.user.role];

    db.query(sql, params, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "Password update failed" });
      }

      res.json({ message: "Password updated successfully" });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

//reset pricipal password
app.post("/api/forgot-password", async (req, res) => {
  const now = Date.now();
  const last = resetCooldown.get("principal");

  if (last && now - last < 60000) {
    return res.status(429).json({
      message: "Please wait before requesting again",
    });
  }

  const newPassword = crypto.randomBytes(4).toString("hex");
  const hash = await bcrypt.hash(newPassword, 10);

  await transporter.sendMail({
    from: `"PRS System" <${process.env.EMAIL_USER}>`,
    to: process.env.PRINCIPAL_EMAIL,
    subject: "PRS Password Reset",
    html: `
    <h3>Password Reset Successful</h3>
    <p>Your new login password is:</p>
    <h2>${newPassword}</h2>
  `,
  });

  db.query(
    `UPDATE users SET password_hash = ? WHERE role = 'SUPER_ADMIN'`,
    [hash],
    (err) => {
      if (err) return res.status(500).json({ message: "DB error" });

      res.json({ message: "New password sent to principal email" });
    },
  );
  resetCooldown.set("principal", now);
});

//fetch deartment subs
app.get("/api/subjects", authenticate, (req, res) => {
  const { role, dept } = req.user;
  let sql = `
    SELECT s.id, s.name, s.sem
    FROM subs s
    JOIN depts d ON s.dept_id = d.id
  `;
  const params = [];

  if (role === "DEPT_ADMIN") {
    sql += " WHERE d.code = ?";
    params.push(dept);
  }

  sql += " ORDER BY s.sem, s.name";
  db.query(sql, params, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "DB error" });
    }

    res.json(results);
  });
});

//edit sub
app.put("/api/subjects/:id", authenticate, (req, res) => {
  const { role, dept } = req.user;
  const { id } = req.params;
  const { name, sem } = req.body;

  if (!name || !sem) {
    return res.status(400).json({ message: "Name and semester required" });
  }

  const sql = `
    UPDATE subs s
    JOIN depts d ON s.dept_id = d.id
    SET s.name = ?, s.sem = ?
    WHERE s.id = ? AND d.code = ?
  `;

  db.query(sql, [name, sem, id, dept], (err, result) => {
    if (err) return res.status(500).json({ message: "DB error" });

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "Subject not found or unauthorized" });
    }

    res.json({ message: "Subject updated successfully" });
  });
});

//delete sub
app.delete("/api/subjects/:id", authenticate, (req, res) => {
  const { role, dept } = req.user;
  const { id } = req.params;

  if (role !== "DEPT_ADMIN") {
    return res.status(403).json({ message: "Unauthorized" });
  }

  const checkSql = `
    SELECT c.year, c.division
    FROM class_linkings cl
    JOIN classes c ON cl.class_id = c.id
    JOIN depts d ON c.dept_id = d.id
    WHERE cl.sub_id = ? AND d.code = ?
  `;

  db.query(checkSql, [id, dept], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error" });

    if (rows.length > 0) {
      return res.status(409).json({
        message: "Subject is assigned to classrooms",
        classrooms: rows.map((r) => `${r.year} ${r.division}`),
      });
    }

    const deleteSql = `
      DELETE s FROM subs s
      JOIN depts d ON s.dept_id = d.id
      WHERE s.id = ? AND d.code = ?
    `;

    db.query(deleteSql, [id, dept], (err2) => {
      if (err2) return res.status(500).json({ message: "DB error" });
      res.json({ message: "Subject deleted" });
    });
  });
});

// add subject
app.post("/api/subjects", authenticate, (req, res) => {
  const { role, dept } = req.user;
  const { name, sem } = req.body;

  if (!name || !sem) {
    return res.status(400).json({ message: "Name and semester required" });
  }

  // Only DEPT_ADMIN should add subjects
  if (role !== "DEPT_ADMIN") {
    return res.status(403).json({ message: "Unauthorized" });
  }

  const sql = `
    INSERT INTO subs (name, sem, dept_id)
    SELECT ?, ?, d.id
    FROM depts d
    WHERE d.code = ?
  `;

  db.query(sql, [name, sem, dept], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "DB error" });
    }

    res.status(201).json({ message: "Subject added successfully" });
  });
});

//fetch proffs
app.get("/api/proffs", authenticate, (req, res) => {
  const { role, dept } = req.user;
  if (role !== "DEPT_ADMIN") {
    return res.status(403).json({ message: "Unauthorized" });
  }
  const sql = `
    SELECT p.id, p.name
    FROM proffs p
    JOIN depts d ON p.dept_id = d.id
    WHERE d.code = ?
    ORDER BY p.name
  `;
  db.query(sql, [dept], (err, results) => {
    if (err) return res.status(500).json({ message: "DB error" });
    res.json(results);
  });
});

// ADD teacher
app.post("/api/proffs", authenticate, (req, res) => {
  const { role, dept } = req.user;
  const { name } = req.body;

  if (role !== "DEPT_ADMIN") {
    return res.status(403).json({ message: "Unauthorized" });
  }

  if (!name) {
    return res.status(400).json({ message: "Name required" });
  }

  const sql = `
    INSERT INTO proffs (name, dept_id)
    SELECT ?, d.id
    FROM depts d
    WHERE d.code = ?
  `;

  db.query(sql, [name, dept], (err, result) => {
    if (err) return res.status(500).json({ message: "DB error" });
    res.status(201).json({ id: result.insertId, name });
  });
});

// EDIT proff
app.put("/api/proffs/:id", authenticate, (req, res) => {
  const { role, dept } = req.user;
  const { id } = req.params;
  const { name } = req.body;

  if (role !== "DEPT_ADMIN") {
    return res.status(403).json({ message: "Unauthorized" });
  }

  const sql = `
    UPDATE proffs p
    JOIN depts d ON p.dept_id = d.id
    SET p.name = ?
    WHERE p.id = ? AND d.code = ?
  `;

  db.query(sql, [name, id, dept], (err, result) => {
    if (err) return res.status(500).json({ message: "DB error" });

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Not found or unauthorized" });
    }

    res.json({ message: "Teacher updated" });
  });
});

// DELETE proff
app.delete("/api/proffs/:id", authenticate, (req, res) => {
  const { role, dept } = req.user;
  const { id } = req.params;

  if (role !== "DEPT_ADMIN") {
    return res.status(403).json({ message: "Unauthorized" });
  }

  // Check if proff in use
  const checkSql = `
    SELECT c.year, c.division
    FROM class_linkings cl
    JOIN classes c ON cl.class_id = c.id
    JOIN depts d ON c.dept_id = d.id
    WHERE cl.proff_id = ? AND d.code = ?
  `;

  db.query(checkSql, [id, dept], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error" });

    // proff in use
    if (rows.length > 0) {
      return res.status(409).json({
        message: "Professor is assigned to classrooms",
        classrooms: rows.map((r) => `${r.year} ${r.division}`),
      });
    }

    // delete if not in use
    const deleteSql = `
      DELETE p FROM proffs p
      JOIN depts d ON p.dept_id = d.id
      WHERE p.id = ? AND d.code = ?
    `;

    db.query(deleteSql, [id, dept], (err2, result) => {
      if (err2) return res.status(500).json({ message: "DB error" });
      res.json({ message: "Professor deleted" });
    });
  });
});

// GET classrooms
app.get("/api/classes", authenticate, (req, res) => {
  const { role, dept } = req.user;

  if (role !== "DEPT_ADMIN") {
    return res.status(403).json({ message: "Unauthorized" });
  }

  const sql = `
    SELECT c.id, c.year, c.division
    FROM classes c
    JOIN depts d ON c.dept_id = d.id
    WHERE d.code = ?
    ORDER BY c.year, c.division
  `;

  db.query(sql, [dept], (err, results) => {
    if (err) return res.status(500).json({ message: "DB error" });
    res.json(results);
  });
});

// ADD classroom
app.post("/api/classes", authenticate, (req, res) => {
  const { role, dept } = req.user;
  const { year, division } = req.body;

  if (role !== "DEPT_ADMIN") {
    return res.status(403).json({ message: "Unauthorized" });
  }

  if (!year || !division) {
    return res.status(400).json({ message: "Year and division required" });
  }

  const sql = `
    INSERT INTO classes (year, division, dept_id)
    SELECT ?, ?, d.id
    FROM depts d
    WHERE d.code = ?
  `;

  db.query(sql, [year, division, dept], (err, result) => {
    if (err) {
      // UNIQUE constraint violation
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Classroom already exists" });
      }
      return res.status(500).json({ message: "DB error" });
    }

    res.status(201).json({
      id: result.insertId,
      year,
      division,
    });
  });
});

// EDIT classroom
app.put("/api/classes/:id", authenticate, (req, res) => {
  const { role, dept } = req.user;
  const { id } = req.params;
  const { year, division } = req.body;

  if (role !== "DEPT_ADMIN") {
    return res.status(403).json({ message: "Unauthorized" });
  }

  const sql = `
    UPDATE classes c
    JOIN depts d ON c.dept_id = d.id
    SET c.year = ?, c.division = ?
    WHERE c.id = ? AND d.code = ?
  `;

  db.query(sql, [year, division, id, dept], (err, result) => {
    if (err) {
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Duplicate classroom" });
      }
      return res.status(500).json({ message: "DB error" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Not found or unauthorized" });
    }

    res.json({ message: "Classroom updated" });
  });
});

// DELETE classroom
app.delete("/api/classes/:id", authenticate, (req, res) => {
  const { role, dept } = req.user;
  const { id } = req.params;

  if (role !== "DEPT_ADMIN") {
    return res.status(403).json({ message: "Unauthorized" });
  }

  const sql = `
    DELETE c FROM classes c
    JOIN depts d ON c.dept_id = d.id
    WHERE c.id = ? AND d.code = ?
  `;

  db.query(sql, [id, dept], (err, result) => {
    if (err) return res.status(500).json({ message: "DB error" });

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Not found or unauthorized" });
    }

    res.json({ message: "Classroom deleted" });
  });
});

// GET class linkings
app.get("/api/classes/:id/linkings", authenticate, (req, res) => {
  const { role, dept } = req.user;
  const { id } = req.params;

  if (role !== "DEPT_ADMIN") {
    return res.status(403).json({ message: "Unauthorized" });
  }

  const sql = `
    SELECT cl.id,
       cl.sub_id,
       cl.proff_id,
       s.name AS subject,
       p.name AS teacher
    FROM class_linkings cl
    JOIN classes c ON cl.class_id = c.id
    JOIN depts d ON c.dept_id = d.id
    JOIN subs s ON cl.sub_id = s.id
    JOIN proffs p ON cl.proff_id = p.id
    WHERE c.id = ? AND d.code = ?
    ORDER BY s.name
  `;

  db.query(sql, [id, dept], (err, results) => {
    if (err) return res.status(500).json({ message: "DB error" });
    res.json(results);
  });
});

// ADD class linking
app.post("/api/classes/:id/linkings", authenticate, (req, res) => {
  const { role, dept } = req.user;
  const { id } = req.params;
  const { sub_id, proff_id } = req.body;

  if (role !== "DEPT_ADMIN") {
    return res.status(403).json({ message: "Unauthorized" });
  }

  const sql = `
    INSERT INTO class_linkings (class_id, sub_id, proff_id)
    SELECT ?, ?, ?
    FROM classes c
    JOIN depts d ON c.dept_id = d.id
    WHERE c.id = ? AND d.code = ?
  `;

  db.query(sql, [id, sub_id, proff_id, id, dept], (err, result) => {
    if (err) {
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "Subject already assigned" });
      }
      return res.status(500).json({ message: "DB error" });
    }

    res.status(201).json({ message: "Assignment added" });
  });
});

// EDIT linking
app.put("/api/linkings/:id", authenticate, (req, res) => {
  const { role, dept } = req.user;
  const { id } = req.params;
  const { proff_id } = req.body;

  if (role !== "DEPT_ADMIN") {
    return res.status(403).json({ message: "Unauthorized" });
  }

  const sql = `
    UPDATE class_linkings cl
    JOIN classes c ON cl.class_id = c.id
    JOIN depts d ON c.dept_id = d.id
    SET cl.proff_id = ?
    WHERE cl.id = ? AND d.code = ?
  `;

  db.query(sql, [proff_id, id, dept], (err, result) => {
    if (err) return res.status(500).json({ message: "DB error" });

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Not found or unauthorized" });
    }

    res.json({ message: "Assignment updated" });
  });
});

// DELETE linking
app.delete("/api/linkings/:id", authenticate, (req, res) => {
  const { role, dept } = req.user;
  const { id } = req.params;

  if (role !== "DEPT_ADMIN") {
    return res.status(403).json({ message: "Unauthorized" });
  }

  const sql = `
    DELETE cl FROM class_linkings cl
    JOIN classes c ON cl.class_id = c.id
    JOIN depts d ON c.dept_id = d.id
    WHERE cl.id = ? AND d.code = ?
  `;

  db.query(sql, [id, dept], (err, result) => {
    if (err) return res.status(500).json({ message: "DB error" });

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Not found or unauthorized" });
    }

    res.json({ message: "Assignment removed" });
  });
});

// CREATE voting session (QR generation)
app.post("/api/voting-sessions", authenticate, (req, res) => {
  const { role } = req.user;
  const { division } = req.body;

  if (role !== "SUPER_ADMIN") {
    return res.status(403).json({ message: "Unauthorized" });
  }

  if (!division) {
    return res.status(400).json({ message: "Division required" });
  }

  const checkSql = `
    SELECT id FROM voting_sessions
    WHERE is_active = TRUE
    AND end_time > NOW()
    LIMIT 1
  `;

  db.query(checkSql, (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error" });

    if (rows.length > 0) {
      return res.status(409).json({ message: "Active session already exists" });
    }

    // GET CURRENT CLASS LINKINGS
    const snapshotSql = `
      SELECT 
        cl.id AS linking_id,
        p.id AS teacher_id,
        p.name AS teacher,
        s.name AS subject
      FROM class_linkings cl
      JOIN classes c ON cl.class_id = c.id
      JOIN proffs p ON cl.proff_id = p.id
      JOIN subs s ON cl.sub_id = s.id
      JOIN depts d ON c.dept_id = d.id
      WHERE CONCAT(LOWER(d.code), '-', LOWER(c.year), '-', LOWER(c.division)) = ?
    `;

    db.query(snapshotSql, [division], (err2, rows2) => {
      if (err2) {
        console.error(err2);
        return res.status(500).json({ message: "Snapshot fetch error" });
      }

      if (rows2.length === 0) {
        return res.status(400).json({
          message: "No teachers assigned to this class",
        });
      }

      const snapshot = rows2.map((r) => ({
        linking_id: r.linking_id,
        teacher_id: r.teacher_id,
        teacher: r.teacher,
        subject: r.subject,
      }));

      const insertSql = `
        INSERT INTO voting_sessions
        (division, ts_snap, start_time, end_time)
        VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 5 MINUTE))
      `;

      db.query(
        insertSql,
        [division, JSON.stringify(snapshot)],
        (err3, result) => {
          if (err3) {
            console.error(err3);
            return res.status(500).json({ message: "DB error" });
          }

          res.json({
            session_id: result.insertId,
            remaining_seconds: 300,
          });
        },
      );
    });
  });
});

app.post("/api/voting-sessions/:id/expire", authenticate, (req, res) => {
  const { role } = req.user;
  const { id } = req.params;

  if (role !== "SUPER_ADMIN") {
    return res.status(403).json({ message: "Unauthorized" });
  }

  const sql = `
    UPDATE voting_sessions
    SET is_active = FALSE
    WHERE id = ? AND is_active = TRUE
  `;

  db.query(sql, [id], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "DB error" });
    }

    res.json({ message: "Session expired" });
  });
});

app.post("/api/init_vote", (req, res) => {
  //console.log("INIT VOTE BODY:", req.body);
  const { session_id, fingerprint } = req.body;

  if (!session_id || !fingerprint) {
    return res.status(400).json({ message: "Missing data" });
  }

  // const deviceHash = crypto
  //   .createHash("sha256")
  //   .update(fingerprint)
  //   .digest("hex");
  const deviceHash = fingerprint;

  // console.log("INIT:", {
  //   session_id,
  //   deviceHash,
  // });

  // Check if already voted
  const checkSql = `
    SELECT id FROM voting_results
    WHERE session_id = ? AND device_hash = ?
    LIMIT 1
  `;

  db.query(checkSql, [session_id, deviceHash], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error" });

    if (rows.length > 0) {
      return res.json({ already_voted: true });
    }

    // CHECK EXISTING TOKEN
    const existingTokenSql = `
      SELECT token FROM voting_tokens
      WHERE session_id = ? AND device_hash = ? AND used = FALSE
      LIMIT 1
    `;

    db.query(existingTokenSql, [session_id, deviceHash], (err2, existing) => {
      if (err2) return res.status(500).json({ message: "DB error" });

      if (existing.length > 0) {
        return res.json({
          already_voted: false,
          vote_token: existing[0].token,
        });
      }

      // CREATE NEW TOKEN
      const token = uuidv4();

      const insertSql = `
        INSERT INTO voting_tokens (session_id, token, device_hash)
        VALUES (?, ?, ?)
      `;

      db.query(insertSql, [session_id, token, deviceHash], (err3) => {
        if (err3) {
          if (err3.code === "ER_DUP_ENTRY") {
            return res.json({
              already_voted: false,
              vote_token: null,
            });
          }

          return res.status(500).json({ message: "DB error" });
        }

        res.json({
          already_voted: false,
          vote_token: token,
        });
      });
    });
  });
});

app.post("/api/vote", async (req, res) => {
  const { class_session, rankings, fingerprint } = req.body;

  if (!class_session || !rankings || !fingerprint) {
    return res.status(400).json({ message: "Missing voting data" });
  }

  const sessionId = class_session;

  const voteSessionId = uuidv4();
  // const deviceHash = crypto
  //   .createHash("sha256")
  //   .update(fingerprint)
  //   .digest("hex");
  const deviceHash = fingerprint;

  const checkSql = `SELECT *,
      TIMESTAMPDIFF(SECOND, NOW(), end_time) AS remaining_seconds
      FROM voting_sessions
      WHERE id = ?
      LIMIT 1
    `;

  db.query(checkSql, [sessionId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "DB error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Voting session not found" });
    }

    const session = results[0];

    // Check active
    if (!session.is_active) {
      return res.status(403).json({ message: "Voting session closed" });
    }

    // Check expiry
    if (session.remaining_seconds <= 0) {
      db.query("UPDATE voting_sessions SET is_active = FALSE WHERE id = ?", [
        sessionId,
      ]);

      return res.status(403).json({ message: "Voting session expired" });
    }

    // Check vote limit
    if (session.votes_cast >= session.max_votes) {
      db.query("UPDATE voting_sessions SET is_active = FALSE WHERE id = ?", [
        sessionId,
      ]);

      return res.status(403).json({ message: "Maximum votes reached" });
    }

    const { vote_token } = req.body;
    // console.log("VOTE:", {
    //   token: vote_token,
    //   sessionId,
    //   deviceHash,
    // });

    const tokenCheckSql = `
  SELECT * FROM voting_tokens
  WHERE token = ?
  AND session_id = ?
  AND device_hash = ?
  AND used = FALSE
  LIMIT 1
`;

    db.query(
      tokenCheckSql,
      [vote_token, sessionId, deviceHash],
      (errToken, tokenRows) => {
        if (errToken) return res.status(500).json({ message: "DB error" });

        if (tokenRows.length === 0) {
          // console.log("INVALID TOKEN OR MISMATCH", {
          //   token: vote_token,
          //   sessionId,
          //   deviceHash,
          // });

          return res
            .status(403)
            .json({ message: "Invalid or expired session" });
        }

        const insertSql = `
          INSERT INTO voting_results
          (session_id, vote_session_id, device_hash, rankings)
          VALUES (?, ?, ?, ?)
        `;

        db.query(
          insertSql,
          [sessionId, voteSessionId, deviceHash, JSON.stringify(rankings)],
          (err3) => {
            if (err3) {
              console.error(err3);
              return res
                .status(500)
                .json({ message: "Database error during voting" });
            }

            const updateSql = `
          UPDATE voting_sessions
          SET votes_cast = votes_cast + 1
          WHERE id = ?
        `;

            db.query(updateSql, [sessionId]);

            // MARK TOKEN USED
            if (!err3) {
              db.query("UPDATE voting_tokens SET used = TRUE WHERE token = ?", [
                vote_token,
              ]);
            }

            res.json({
              message: "Vote cast successfully",
              vote_session_id: voteSessionId,
            });
          },
        );
      },
    );
  });
});

//fetch active qr sessions
app.get("/api/voting-sessions/active", authenticate, (req, res) => {
  const { role } = req.user;

  if (role !== "SUPER_ADMIN") {
    return res.status(403).json({ message: "Unauthorized" });
  }

  const sql = `SELECT *,
        TIMESTAMPDIFF(SECOND, NOW(), end_time) AS remaining_seconds
        FROM voting_sessions
        WHERE is_active = TRUE
        AND end_time > NOW()
        ORDER BY start_time DESC
        LIMIT 1
      `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "DB error" });
    }

    if (results.length === 0) {
      return res.json({ active: false });
    }

    res.json({
      active: true,
      session: results[0],
    });
  });
});

//get session details
app.get("/api/voting-sessions/:id", (req, res) => {
  console.log("SESSION FETCH HIT", req.params.id);
  const { id } = req.params;

  const sql = `
    SELECT *,
    TIMESTAMPDIFF(SECOND, NOW(), end_time) AS remaining_seconds
    FROM voting_sessions
    WHERE id = ?
    LIMIT 1
  `;

  db.query(sql, [id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "DB error" });
    }

    if (results.length === 0) {
      console.log("SESSION NOT FOUND");
      return res.status(404).json({ message: "Session not found" });
    }

    const session = results[0];
    console.log("SESSION ACTIVE FLAG:", session.is_active);
    console.log("SESSION END TIME:", session.end_time);
    console.log("REMAINING SECONDS:", session.remaining_seconds);

    // THE ONLY CHECK
    if (!session.is_active) {
      console.log("SESSION MARKED INACTIVE");
      return res.status(403).json({ message: "Session expired" });
    }

    console.log("SESSION VALID");
    res.json(session);
  });
});

// to get proffs for votings
app.get("/api/teachers", (req, res) => {
  const { session } = req.query;

  if (!session) {
    return res.status(400).json({ message: "Session id required" });
  }

  const sql = "SELECT ts_snap FROM voting_sessions WHERE id = ? LIMIT 1";

  db.query(sql, [session], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "DB error" });
    }

    if (rows.length === 0) {
      return res.status(404).json({ message: "Session not found" });
    }

    const snapshot =
      typeof rows[0].ts_snap === "string"
        ? JSON.parse(rows[0].ts_snap)
        : rows[0].ts_snap;

    const teachers = snapshot.map((t) => ({
      id: t.linking_id,
      teacher_id: t.teacher_id,
      name: t.teacher,
      subject: t.subject,
    }));

    res.json(teachers);
  });
});

//get acadmeic years
app.get("/api/academic-years", (req, res) => {
  const { department, year, division } = req.query;

  if (!department || !year || !division) {
    return res.status(400).json({ message: "Missing filters" });
  }

  const fullDivision = `${department}-${year}-${division}`.toUpperCase();

  const sql = `
    SELECT DISTINCT
    CASE
      WHEN MONTH(vr.submitted_at) >= 7
        THEN CONCAT(YEAR(vr.submitted_at), '-', RIGHT(YEAR(vr.submitted_at)+1,2))
      ELSE
        CONCAT(YEAR(vr.submitted_at)-1, '-', RIGHT(YEAR(vr.submitted_at),2))
    END AS academic_year
    FROM voting_results vr
    JOIN voting_sessions vs ON vr.session_id = vs.id
    WHERE UPPER(vs.division) = UPPER(?)
    ORDER BY academic_year DESC
  `;

  db.query(sql, [fullDivision], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "DB error" });
    }

    res.json(results.map((r) => r.academic_year));
  });
});

//rankings results
app.get("/api/results", (req, res) => {
  const { department, year, division, academic_year } = req.query;

  if (!department || !year || !division || !academic_year) {
    return res.status(400).json({ message: "Missing filters" });
  }

  const fullDivision = `${department}-${year}-${division}`.toUpperCase();

  const voteSql = `
    SELECT vr.rankings, vr.session_id
    FROM voting_results vr
    JOIN voting_sessions vs ON vr.session_id = vs.id
    WHERE UPPER(vs.division) = UPPER(?)
    AND (
      CASE
        WHEN MONTH(vr.submitted_at) >= 7
          THEN CONCAT(YEAR(vr.submitted_at), '-', RIGHT(YEAR(vr.submitted_at)+1,2))
        ELSE
          CONCAT(YEAR(vr.submitted_at)-1, '-', RIGHT(YEAR(vr.submitted_at),2))
      END
    ) = ?
  `;

  db.query(voteSql, [fullDivision, academic_year], (err, votes) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Server Error" });
    }

    const totalVotes = votes.length;

    if (!votes || totalVotes === 0) {
      return res.json({
        rankings: [],
        totalVotes: 0,
      });
    }

    const sessionId = votes[0].session_id;

    db.query(
      "SELECT ts_snap FROM voting_sessions WHERE id = ?",
      [sessionId],
      (snapErr, snapRows) => {
        if (snapErr) {
          console.error(snapErr);
          return res.status(500).json({ message: "Snapshot fetch error" });
        }

        const snapshot =
          typeof snapRows[0].ts_snap === "string"
            ? JSON.parse(snapRows[0].ts_snap)
            : snapRows[0].ts_snap;

        const snapshotMap = {};
        snapshot.forEach((item) => {
          snapshotMap[item.linking_id] = item;
        });

        const { S, V } = compBordaScores(votes);

        const W = compWeightedBorda(S, V);
   
        const sortedTeachers = Object.entries(W)
          .map(([linkingId, score]) => ({
            linkingId: Number(linkingId),
            score,
          }))
          .sort((a, b) => b.score - a.score);

        let prevScore = null;
        let prevRank = 0;

        const finalRanking = sortedTeachers.map((teacher, index) => {
          let rank;

          if (teacher.score === prevScore) {
            rank = prevRank;
          } else {
            rank = index + 1;
            prevRank = rank;
            prevScore = teacher.score;
          }

          const snap = snapshotMap[teacher.linkingId];

          return {
            rank,
            teacher: snap?.teacher || "Unknown",
            subject: snap?.subject || "Unknown",
            score: Number(teacher.score.toFixed(2)),
          };
        });

        res.json({
          rankings: finalRanking,
          totalVotes,
        });
      },
    );
  });
});

//draw table func
function drawTable(doc, options) {
  const {
    startX,
    startY,
    colWidths,
    headers,
    rows,
    footerHeight = 80,
    minRowHeight = 30,
    drawFooter,
    nextPage,
  } = options;

  let y = startY;

  const headerHeight = 30;

  function drawHeader() {
    let x = startX;

    doc.font("Helvetica-Bold").fontSize(12);

    headers.forEach((header, i) => {
      doc.save();

      doc
        .rect(x, y, colWidths[i], headerHeight)
        .fillAndStroke("#eeeeee", "#000000");

      doc.fillColor("black");

      doc.text(header, x, y + 8, {
        width: colWidths[i],
        align: "center",
      });

      x += colWidths[i];
    });

    y += headerHeight;
  }

  drawHeader();

  doc.font("Helvetica");

  rows.forEach((row) => {
    // calculate dynamic row height
    let maxHeight = minRowHeight;

    row.forEach((cell, i) => {
      const height = doc.heightOfString(String(cell), {
        width: colWidths[i],
      });

      maxHeight = Math.max(maxHeight, height + 12);
    });

    const rowHeight = maxHeight;

    // page break
    if (y + rowHeight > doc.page.height - footerHeight) {
      drawFooter();
      doc.addPage();
      nextPage();
      y = 50;
      drawHeader();
    }

    let x = startX;

    row.forEach((cell, i) => {
      doc.rect(x, y, colWidths[i], rowHeight).stroke();

      doc.text(String(cell), x, y + 8, {
        width: colWidths[i],
        align: "center",
      });

      x += colWidths[i];
    });

    y += rowHeight;
  });

  return y; // return final Y position
}

//generate report by class
app.get("/api/reports/class", (req, res) => {
  const { department, year, division, academic_year } = req.query;

  if (!department || !year || !division || !academic_year) {
    return res.status(400).json({ message: "Missing filters" });
  }

  const fullDivision = `${department}-${year}-${division}`.toUpperCase();

  const voteSql = `
  SELECT vr.rankings, vr.session_id
  FROM voting_results vr
  JOIN voting_sessions vs ON vr.session_id = vs.id
  WHERE UPPER(vs.division) = UPPER(?)
  AND (
    CASE
      WHEN MONTH(vr.submitted_at) >= 7
        THEN CONCAT(YEAR(vr.submitted_at), '-', RIGHT(YEAR(vr.submitted_at)+1,2))
      ELSE
        CONCAT(YEAR(vr.submitted_at)-1, '-', RIGHT(YEAR(vr.submitted_at),2))
    END
  ) = ?
  `;

  db.query(voteSql, [fullDivision, academic_year], (err, votes) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Database error" });
    }

    if (!votes || votes.length === 0) {
      return res.status(404).json({
        message: "No votes available for this class",
      });
    }

    const sessionId = votes[0].session_id;

    db.query(
      "SELECT ts_snap, start_time FROM voting_sessions WHERE id = ?",
      [sessionId],
      (snapErr, snapRows) => {
        if (snapErr) {
          console.error(snapErr);
          return res.status(500).json({ message: "Snapshot fetch error" });
        }

        const sessionTime = new Date(snapRows[0].start_time);

        const sessionDate = sessionTime.toLocaleDateString();
        const sessionClock = sessionTime.toLocaleTimeString();

        const snapshot =
          typeof snapRows[0].ts_snap === "string"
            ? JSON.parse(snapRows[0].ts_snap)
            : snapRows[0].ts_snap;

        const snapshotMap = {};
        snapshot.forEach((item) => {
          snapshotMap[item.linking_id] = item;
        });

        const { S, V } = compBordaScores(votes);
        const W = compWeightedBorda(S, V);

        const sortedTeachers = Object.entries(W)
          .map(([linkingId, score]) => ({
            linkingId: Number(linkingId),
            score,
          }))
          .sort((a, b) => b.score - a.score);

        /* ---------------- PDF GENERATION ---------------- */

        const doc = new PDFDocument({ margin: 50 });
        let pageNumber = 1;

        const generatedAt = new Date();
        const generatedText =
          generatedAt.toLocaleDateString() +
          " " +
          generatedAt.toLocaleTimeString();

        function drawFooter() {
          const pageWidth = doc.page.width;
          const footerY = doc.page.height - 40;

          doc.save();

          // separator line
          doc
            .moveTo(50, footerY - 10)
            .lineTo(pageWidth - 50, footerY - 10)
            .lineWidth(0.5)
            .stroke();

          doc.font("Helvetica").fontSize(9);

          // LEFT
          doc.text(`Generated On: ${generatedText}`, 50, footerY, {
            lineBreak: false,
          });

          // CENTER (manual centering)
          const centerText = "Professor Ranking System";
          const centerWidth = doc.widthOfString(centerText);

          const centerX = (doc.page.width - centerWidth) / 2;

          doc.text(centerText, centerX, footerY, { lineBreak: false });

          // RIGHT (manual right alignment)
          const pageText = `Page ${pageNumber}`;
          const pageWidthText = doc.widthOfString(pageText);
          doc.text(pageText, pageWidth - 50 - pageWidthText, footerY, {
            lineBreak: false,
          });

          doc.restore();
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=class-report-${department}-${year}-${division}.pdf`,
        );

        doc.pipe(res);

        /* ---------- HEADER IMAGE ---------- */

        const headerPath = path.join(__dirname, "assets", "header.png");

        if (require("fs").existsSync(headerPath)) {
          doc.image(headerPath, 50, 30, { width: 500 });
        }

        doc.moveDown(4);

        /* ---------- TITLE ---------- */

        doc.moveDown(2);

        doc.fontSize(18).font("Helvetica-Bold").text("Class Rankings Report", {
          align: "center",
        });

        /* ---------- REPORT INFO BLOCK ---------- */

        doc.font("Helvetica-Bold").fontSize(15);

        doc.moveDown(0.3);
        doc.text(`Department: ${department}`, { align: "center" });
        doc.text(`Academic Year: ${academic_year}`, { align: "center" });
        doc.moveDown(1.5);

        const infoY = doc.y;

        doc.font("Helvetica").fontSize(12);
        doc.text(`Year: ${year}`, 50, infoY);
        const rightX = doc.page.width - doc.page.margins.right;

        const divisionText = `Division: ${division}`;
        const timeText = `Time: ${sessionClock}`;

        doc.text(divisionText, rightX - doc.widthOfString(divisionText), infoY);
        doc.text(`Date: ${sessionDate}`, 50, infoY + 18);
        doc.text(timeText, rightX - doc.widthOfString(timeText), infoY + 18);

        doc.moveDown(3);

        doc
          .font("Helvetica-Oblique")
          .fontSize(10)
          .text(
            "Rankings are computed using the Borda Count method, where higher preference yields higher points.",
            50,
            doc.y,
            {
              width: doc.page.width - 100,
              align: "center",
            },
          );

        doc.moveDown(1.5);

        let prevScore = null;
        let prevRank = 0;

        const rankedTeachers = sortedTeachers.map((t, index) => {
          let rank;

          if (t.score === prevScore) {
            rank = prevRank;
          } else {
            rank = index + 1;
            prevRank = rank;
            prevScore = t.score;
          }

          return { ...t, rank };
        });

        /* ---------- Tbale Generation ---------- */
        const rows = rankedTeachers.map((t) => {
          const snap = snapshotMap[t.linkingId];

          return [
            t.rank,
            snap?.teacher || "Unknown",
            snap?.subject || "Unknown",
            Number(t.score.toFixed(2)),
          ];
        });

        const tableTop = doc.y;

        const colWidths = [60, 240, 130, 70];

        const headers = ["Rank", "Professor", "Subject", "Score"];

        const printableWidth =
          doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const tableWidth = colWidths.reduce((a, b) => a + b, 0);
        const tableLeft =
          doc.page.margins.left + (printableWidth - tableWidth) / 2;

        const tableEndY = drawTable(doc, {
          startX: tableLeft,
          startY: tableTop,
          colWidths,
          headers,
          rows,
          drawFooter,
          nextPage: () => pageNumber++,
        });
        /* ---------- VOTE COUNT ---------- */

        const voteText = `Total Students Voted: ${votes.length}`;

        const voteWidth = doc.widthOfString(voteText);

        const voteX = tableLeft + (500 - voteWidth) / 2;

        doc.font("Helvetica").fontSize(10);

        doc.text(voteText, voteX, tableEndY + 20);

        drawFooter();
        doc.end();
      },
    );
  });
});

//get proffs for report generation
app.get("/api/reports/professors", (req, res) => {
  const sql = `SELECT ts_snap FROM voting_sessions`;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Database error" });
    }

    const professorSet = new Set();

    rows.forEach((row) => {
      const snap =
        typeof row.ts_snap === "string" ? JSON.parse(row.ts_snap) : row.ts_snap;

      snap.forEach((p) => {
        if (p.teacher) {
          professorSet.add(p.teacher);
        }
      });
    });

    const result = [...professorSet].sort().map((name, i) => ({
      id: i + 1,
      name,
    }));

    res.json(result);
  });
});

//proff pdf generator func
function generateProfessorPDF(data) {
  const { res, professorName, subjects, departments, academicYears, rows } =
    data;

  const doc = new PDFDocument({ margin: 50 });
  let pageNumber = 1;

  const generatedAt = new Date();
  const generatedText =
    generatedAt.toLocaleDateString() + " " + generatedAt.toLocaleTimeString();

  function drawFooter() {
    const pageWidth = doc.page.width;
    const footerY = doc.page.height - 40;

    doc.save();

    doc
      .moveTo(50, footerY - 10)
      .lineTo(pageWidth - 50, footerY - 10)
      .lineWidth(0.5)
      .stroke();

    doc.font("Helvetica").fontSize(9);

    doc.text(`Generated On: ${generatedText}`, 50, footerY, {
      lineBreak: false,
    });

    const centerText = "Professor Ranking System";
    const centerWidth = doc.widthOfString(centerText);

    const centerX = (doc.page.width - centerWidth) / 2;

    doc.text(centerText, centerX, footerY, { lineBreak: false });

    const pageText = `Page ${pageNumber}`;
    const pageWidthText = doc.widthOfString(pageText);

    doc.text(pageText, pageWidth - 50 - pageWidthText, footerY, {
      lineBreak: false,
    });

    doc.restore();
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=professor-report-${professorName}.pdf`,
  );

  doc.pipe(res);

  const headerPath = path.join(__dirname, "assets", "header.png");

  if (fs.existsSync(headerPath)) {
    doc.image(headerPath, 50, 30, { width: 500 });
  }

  doc.moveDown(4);
  doc.moveDown(2);

  doc
    .fontSize(18)
    .font("Helvetica-Bold")
    .text("Professor Ranking Report", { align: "center" });

  doc.moveDown(0.5);

  doc.fontSize(16).text(professorName, { align: "center" });

  doc.moveDown(2);

  doc.font("Helvetica").fontSize(12);

  const infoStartY = doc.y;
  doc.moveDown(0.5);

  doc.font("Helvetica-Bold").text("Subjects Taught:", 50, infoStartY);
  doc.font("Helvetica").text(subjects.join(", "), 180, infoStartY);

  doc.font("Helvetica-Bold").text("Departments:", 50, infoStartY + 20);
  doc
    .font("Helvetica")
    .text(
      departments.map((d) => d.toUpperCase()).join(", "),
      180,
      infoStartY + 20,
    );

  doc.font("Helvetica-Bold").text("Academic Years:", 50, infoStartY + 40);
  doc.font("Helvetica").text(academicYears.join(", "), 180, infoStartY + 40);

  doc.moveDown(3);

  doc
    .font("Helvetica-Oblique")
    .fontSize(10)
    .text(
      "Rankings are computed using the Borda Count method, where higher preference yields higher points.",
      50,
      doc.y,
      {
        width: doc.page.width - 100,
        align: "center",
      },
    );

  doc.moveDown(1.5);

  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("Session Rankings", 50, doc.y, {
      width: doc.page.width - 100,
      align: "center",
    });

  doc.moveDown(1);
  const headers = [
    "Dept",
    "Class",
    "Subject",
    "Rank",
    "Score",
    "Votes",
    "Year",
    "Date",
  ];

  const colWidths = [55, 65, 110, 50, 50, 50, 60, 60];

  const printableWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const tableLeft = doc.page.margins.left + (printableWidth - tableWidth) / 2;

  drawTable(doc, {
    startX: tableLeft,
    startY: doc.y,
    colWidths,
    headers,
    rows,
    drawFooter,
    nextPage: () => pageNumber++,
  });

  drawFooter();
  doc.end();
}

//proff wise report generator
app.get("/api/reports/professor", (req, res) => {
  const professorName = req.query.name;

  if (!professorName) {
    return res.status(400).json({ message: "Professor name required" });
  }

  const sql = `
  SELECT id, division, ts_snap, start_time
  FROM voting_sessions
  `;

  db.query(sql, async (err, sessions) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Database error" });
    }

    let reportRows = [];

    let subjects = new Set();
    let departments = new Set();
    let academicYears = new Set();

    for (const session of sessions) {
      const snapshot =
        typeof session.ts_snap === "string"
          ? JSON.parse(session.ts_snap)
          : session.ts_snap;

      const professorEntries = snapshot.filter(
        (s) => s.teacher === professorName,
      );
      if (!professorEntries.length) continue;
      const linkingIds = professorEntries.map((e) => e.linking_id);
      const subjectsList = [...new Set(professorEntries.map((e) => e.subject))];

      const votes = await new Promise((resolve, reject) => {
        db.query(
          "SELECT rankings, submitted_at FROM voting_results WHERE session_id = ?",
          [session.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          },
        );
      });

      if (!votes.length) continue;

      const { S, V } = compBordaScores(votes);
      const W = compWeightedBorda(S, V);

      const sorted = Object.entries(W)
        .map(([tid, score]) => ({
          teacherId: parseInt(tid),
          score,
        }))
        .sort((a, b) => b.score - a.score);

      const division = session.division;
      const department = division.split("-")[0];

      let prevScore = null;
      let prevRank = 0;

      const rankMap = {};

      sorted.forEach((t, index) => {
        let rank;

        if (t.score === prevScore) {
          rank = prevRank;
        } else {
          rank = index + 1;
          prevRank = rank;
          prevScore = t.score;
        }

        rankMap[t.teacherId] = rank;
      });

      const subjectData = linkingIds.map((linkingId) => {
        const rank = rankMap[linkingId] || 0;
        const score = sorted.find((t) => t.teacherId === linkingId)?.score || 0;

        return {
          linkingId,
          rank,
          score,
        };
      });

      const subjectStr = subjectsList.join(" / ");
      const rankStr = subjectData.map((s) => s.rank).join(" / ");
      const scoreStr = subjectData.map((s) => s.score).join(" / ");
      const votesStr = subjectData.map(() => votes.length).join(" / ");

      const year = division.split("-")[1];
      const div = division.split("-")[2];

      const className = `${year}-${div}`.toUpperCase();

      const sessionDate = new Date(session.start_time).toLocaleDateString();

      const academicYear =
        new Date(session.start_time).getMonth() >= 6
          ? `${new Date(session.start_time).getFullYear()}-${(
              new Date(session.start_time).getFullYear() + 1
            )
              .toString()
              .slice(2)}`
          : `${new Date(session.start_time).getFullYear() - 1}-${new Date(
              session.start_time,
            )
              .getFullYear()
              .toString()
              .slice(2)}`;

      subjectsList.forEach((s) => subjects.add(s));
      departments.add(department);
      academicYears.add(academicYear);

      reportRows.push([
        department.toUpperCase(),
        className,
        subjectStr,
        rankStr,
        scoreStr,
        votesStr,
        academicYear,
        sessionDate,
      ]);
    }

    if (!reportRows.length) {
      return res.status(404).json({ message: "No records found" });
    }

    reportRows.sort((a, b) => {
      if (a[6] === b[6]) return new Date(b[7]) - new Date(a[7]);
      return b[6].localeCompare(a[6]);
    });

    generateProfessorPDF({
      res,
      professorName,
      subjects: [...subjects],
      departments: [...departments],
      academicYears: [...academicYears],
      rows: reportRows,
    });
  });
});

//get classes for qr generation
app.get("/api/principal/classes", authenticate, (req, res) => {
  const { role } = req.user;

  // Only principal can access
  if (role !== "SUPER_ADMIN") {
    return res.status(403).json({ message: "Unauthorized" });
  }

  const sql = `
    SELECT 
      c.id,
      c.year,
      c.division,
      d.code AS dept
    FROM classes c
    JOIN depts d ON c.dept_id = d.id
    ORDER BY d.code, c.year, c.division
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Classes fetch error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    res.json(results);
  });
});

//auto clean sessions every 30 seconds
setInterval(() => {
  const sql = `
    UPDATE voting_sessions
    SET is_active = FALSE
    WHERE is_active = TRUE
    AND end_time < NOW()
  `;

  db.query(sql, (err, result) => {
    if (err) console.error("Session cleanup error:", err);
    else console.log("Sessions expired:", result.affectedRows);
  });
}, 5000); // every 30 seconds

app.get("/*splat", (req, res) => {
  console.log("SPA fallback hit for:", req.url); // helpful debug
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(9000, "0.0.0.0", () =>
  console.log("Server running on http://localhost:9000"),
);
