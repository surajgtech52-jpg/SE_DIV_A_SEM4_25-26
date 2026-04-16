-- Active: 1758452166660@@127.0.0.1@3306@prs_database

DROP DATABASE prs_database;
CREATE DATABASE prs_database;

USE prs_database;

CREATE TABLE IF NOT EXISTS depts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(20) UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE,
    password_hash VARCHAR(255),
    role ENUM('SUPER_ADMIN', 'DEPT_ADMIN'),
    dept_id INT NULL,

    FOREIGN KEY (dept_id) REFERENCES depts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS classes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    dept_id INT,
    year ENUM('FE', 'SE', 'TE', 'BE'),
    division char(1),

    FOREIGN KEY (dept_id) REFERENCES depts(id) ON DELETE CASCADE,
    UNIQUE(dept_id, year, division)
);

CREATE TABLE IF NOT EXISTS proffs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    dept_id INT,
    name VARCHAR(100),

    FOREIGN KEY (dept_id) REFERENCES depts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subs(
    id INT PRIMARY KEY AUTO_INCREMENT,
    dept_id INT,
    name VARCHAR(100),
    sem TINYINT,

    FOREIGN KEY (dept_id) REFERENCES depts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS class_linkings(
    id INT PRIMARY KEY AUTO_INCREMENT,
    class_id INT,
    sub_id INT,
    proff_id INT,

    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (sub_id) REFERENCES subs(id) ON DELETE CASCADE,
    FOREIGN KEY (proff_id) REFERENCES proffs(id) ON DELETE CASCADE,
    UNIQUE(class_id, sub_id)
);

INSERT INTO users (username, password_hash, role, dept_id)
VALUES (
    'APPrincipal',
    '$2b$10$vfWJC6GowN1rmgsX46vEkuYSqTzfLY5dOHm35HmsOFmsg85KSJzM.',
    'SUPER_ADMIN',
    NULL
);

UPDATE users SET password_hash = '$2b$10$vfWJC6GowN1rmgsX46vEkuYSqTzfLY5dOHm35HmsOFmsg85KSJzM.' WHERE username = 'APPrincipal';


DROP TABLE IF EXISTS voting_results; 
DROP TABLE IF EXISTS voting_sessions;
DROP TABLE IF EXISTS voting_tokens;          
CREATE TABLE voting_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    division VARCHAR(50) NOT NULL,
    ts_snap JSON,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    max_votes INT DEFAULT 70,
    votes_cast INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE voting_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    vote_session_id VARCHAR(255),
    device_hash VARCHAR(255) NOT NULL,
    rankings JSON,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (session_id) REFERENCES voting_sessions(id) ON DELETE CASCADE
);

CREATE TABLE voting_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT,
  token VARCHAR(255),
  device_hash VARCHAR(255),
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE unique_device_session (session_id, device_hash)
);