
const express = require("express");
const { GoogleGenAI } = require("@google/genai");

const authMiddleware = require("../middleware/authMiddleware");

const User = require("../models/User");
const Student = require("../models/Student");
const Faculty = require("../models/Faculty");
const HOD = require("../models/HOD");
const Attendance = require("../models/Attendance");


const router = express.Router();

// GEMINI AI
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Use currently documented Gemini Flash model IDs.
// If a model is unavailable for your API key, try the next one.
const MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
];

// Generate AI response with model fallback
async function generateGeminiResponse(prompt) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing from the server environment.");
  }

  let lastError;

  for (const model of MODELS) {
    try {
      console.log(`[AI] Trying model: ${model}`);

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction:
            "You are the helpful AI assistant for Smart College ERP. Answer clearly and accurately. Never invent database information.",
          maxOutputTokens: 2048,
        },
      });

      const text = response?.text;

      if (typeof text === "string" && text.trim()) {
        console.log(`[AI] Success using model: ${model}`);
        return text.trim();
      }

      lastError = new Error(`Empty response from ${model}`);
    } catch (error) {
      lastError = error;

      const status = Number(error?.status || error?.code || 0);
      const errorMessage = String(error?.message || "");

      console.error(`[AI] ${model} failed:`, errorMessage);

      // Try another model only for model/access/quota/server errors.
      const canTryNext =
        [400, 403, 404, 429, 500, 502, 503, 504].includes(status) ||
        /model|quota|rate.?limit|not found|permission|unavailable/i.test(
          errorMessage
        );

      if (!canTryNext) {
        throw error;
      }
    }
  }

  throw lastError || new Error("All configured Gemini models failed.");
}

// ROLE INSTRUCTIONS
function getRoleInstruction(role) {
  const instructions = {
    student: `
You are a helpful college ERP assistant for students.
Help with studies, assignments, exams, attendance and academic questions.
Use only the logged-in student's personal database information.
Never reveal another student's private information.
For general educational questions, explain concepts in simple language.
`,

    faculty: `
You are a helpful college ERP assistant for faculty.
Help with teaching, attendance, academic records and assignments.
Use only the database information supplied to you.
Do not invent student records or academic information.
`,

    hod: `
You are a helpful Head of Department ERP assistant.
Help with department-level records, attendance and academic planning.
Use only the supplied department data.
Never invent counts, names or records.
`,

    admin: `
You are a helpful administrator assistant for Smart College ERP.
Help with student, faculty, HOD, attendance and account information.
Use actual database results for college-specific questions.
Never invent names, emails, phone numbers or counts.
`,
  };

  return instructions[role] || "You are a helpful college ERP assistant.";
}

// USER IDENTIFICATION
function getUserId(user) {
  return user?.id || user?._id || user?.userId || null;
}

function isRecordQuestion(message) {
  return /\b(student|students|faculty|faculties|hod|hods|head of department|attendance|present|absent|late|department|departments|registered|enrolled|database|record|records|count|total|how many|my profile|my details|my information|my cgpa|my course|my semester|name|names|email|phone|mobile|semester|details|list|show|all|profile|profiles|contact|contacts|information)\b/i.test(
    message
  );
}

function asksForCounts(message) {
  return /\b(how many|count|total|number of|statistics|stats|registered|database)\b/i.test(
    message
  );
}

function asksForPeopleDetails(message) {
  return /\b(student|students|faculty|faculties|hod|hods|head of department|heads of department|name|names|email|phone|mobile|semester|department|details|list|show|all|profile|profiles|contact|contacts|information)\b/i.test(
    message
  );
}

function asksAttendance(message) {
  return /\b(attendance|present|absent|late|attendance percentage|attendance report)\b/i.test(
    message
  );
}

function normalizeRole(role) {
  return String(role || "").toLowerCase().trim();
}

// Remove secret fields before passing database information to the AI.
function sanitizeRecord(record) {
  if (record == null) return record;

  if (Array.isArray(record)) {
    return record.map(sanitizeRecord);
  }

  if (record instanceof Date) {
    return record.toISOString();
  }

  if (typeof record !== "object") {
    return record;
  }

  if (record._bsontype === "ObjectId") {
    return record.toString();
  }

  const safeRecord = {};

  const blockedFields = [
    "password",
    "passwordhash",
    "token",
    "accesstoken",
    "refreshtoken",
    "resettoken",
    "resetpasswordtoken",
    "verificationtoken",
    "otp",
    "secret",
    "apikey",
    "authorization",
    "cookie",
    "__v",
  ];

  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = key.toLowerCase().replace(/[_\s-]/g, "");

    if (blockedFields.includes(normalizedKey)) continue;
    if (value === undefined) continue;

    safeRecord[key] = sanitizeRecord(value);
  }

  return safeRecord;
}

// Find the logged-in user's account.
async function findLoggedInAccount(user) {
  const userId = getUserId(user);
  const email = String(user?.email || "").trim().toLowerCase();

  let account = null;

  if (userId) {
    account = await User.findById(userId)
      .select("-password")
      .lean();
  }

  if (!account && email) {
    account = await User.findOne({
      email: { $regex: `^${escapeRegex(email)}$`, $options: "i" },
    })
      .select("-password")
      .lean();
  }

  return account;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// DATABASE CONTEXT
async function getDatabaseContext(user, message) {
  const role = normalizeRole(user?.role);
  const question = String(message || "");

  const context = {};

  if (!isRecordQuestion(question)) {
    return context;
  }

  const attendanceQuestion = asksAttendance(question);
  const countQuestion = asksForCounts(question);
  const detailsQuestion = asksForPeopleDetails(question);

  // ADMIN
  if (role === "admin") {
    const asksStudents = /\b(student|students)\b/i.test(question);
    const asksFaculty = /\b(faculty|faculties)\b/i.test(question);
    const asksHOD =
      /\b(hod|hods|head of department|heads of department)\b/i.test(
        question
      );

    if (countQuestion) {
      const [
        studentProfiles,
        studentAccounts,
        facultyProfiles,
        facultyAccounts,
        hodProfiles,
        hodAccounts,
        totalUserAccounts,
      ] = await Promise.all([
        Student.countDocuments(),
        User.countDocuments({ role: "student" }),
        Faculty.countDocuments(),
        User.countDocuments({ role: "faculty" }),
        HOD.countDocuments(),
        User.countDocuments({ role: "hod" }),
        User.countDocuments(),
      ]);

      context.databaseCounts = {
        studentAccounts,
        studentProfiles,
        facultyAccounts,
        facultyProfiles,
        hodAccounts,
        hodProfiles,
        totalUserAccounts,
      };
    }

    if (detailsQuestion) {
      if (asksStudents) {
        const [accounts, profiles] = await Promise.all([
          User.find({ role: "student" })
            .select("-password")
            .limit(200)
            .lean(),
          Student.find().limit(200).lean(),
        ]);

        context.students = {
          totalAccounts: await User.countDocuments({ role: "student" }),
          returnedAccounts: accounts.length,
          accounts: accounts.map(sanitizeRecord),
          totalProfiles: await Student.countDocuments(),
          returnedProfiles: profiles.length,
          profiles: profiles.map(sanitizeRecord),
        };
      }

      if (asksFaculty) {
        const [accounts, profiles] = await Promise.all([
          User.find({ role: "faculty" })
            .select("-password")
            .limit(200)
            .lean(),
          Faculty.find().limit(200).lean(),
        ]);

        context.faculty = {
          totalAccounts: await User.countDocuments({ role: "faculty" }),
          returnedAccounts: accounts.length,
          accounts: accounts.map(sanitizeRecord),
          totalProfiles: await Faculty.countDocuments(),
          returnedProfiles: profiles.length,
          profiles: profiles.map(sanitizeRecord),
        };
      }

      if (asksHOD) {
        const [accounts, profiles] = await Promise.all([
          User.find({ role: "hod" })
            .select("-password")
            .limit(200)
            .lean(),
          HOD.find().limit(200).lean(),
        ]);

        context.hods = {
          totalAccounts: await User.countDocuments({ role: "hod" }),
          returnedAccounts: accounts.length,
          accounts: accounts.map(sanitizeRecord),
          totalProfiles: await HOD.countDocuments(),
          returnedProfiles: profiles.length,
          profiles: profiles.map(sanitizeRecord),
        };
      }

      if (!asksStudents && !asksFaculty && !asksHOD) {
        context.note =
          "Specify whether you want student, faculty or HOD details.";
      }
    }

    if (attendanceQuestion) {
      const [present, absent, late, total] = await Promise.all([
        Attendance.countDocuments({
          status: { $regex: /^present$/i },
        }),
        Attendance.countDocuments({
          status: { $regex: /^absent$/i },
        }),
        Attendance.countDocuments({
          status: { $regex: /^late$/i },
        }),
        Attendance.countDocuments(),
      ]);

      context.attendanceSummary = {
        total,
        present,
        absent,
        late,
      };
    }

    return context;
  }

  // Find the logged-in account for non-admin roles.
  const account = await findLoggedInAccount(user);

  if (!account) {
    return {
      error:
        "The logged-in account could not be found. Please sign in again.",
    };
  }

  const accountRole = normalizeRole(account.role);

  // Use the role saved in the database as an additional check.
  if (accountRole && accountRole !== role) {
    return {
      error:
        "Your account role does not match your session. Please sign in again.",
    };
  }

  // STUDENT: only the logged-in student's own data.
  if (role === "student") {
    const studentQuery = account.email
      ? {
          email: {
            $regex: `^${escapeRegex(account.email)}$`,
            $options: "i",
          },
        }
      : { _id: null };

    const student = await Student.findOne(studentQuery)
      .select(
        "name email phone mobile course semester enrollmentNo rollNo department attendance cgpa status"
      )
      .lean();

    context.myStudentRecord = student
      ? sanitizeRecord(student)
      : "No matching Student profile was found.";

    if (attendanceQuestion) {
      const records = await Attendance.find({
        studentId: account._id,
      })
        .select("date status course semester department")
        .sort({ date: -1 })
        .limit(100)
        .lean();

      const total = records.length;
      const present = records.filter(
        (record) =>
          String(record.status || "").toLowerCase() === "present"
      ).length;
      const absent = records.filter(
        (record) =>
          String(record.status || "").toLowerCase() === "absent"
      ).length;
      const late = records.filter(
        (record) =>
          String(record.status || "").toLowerCase() === "late"
      ).length;

      context.myAttendance = {
        totalRecordedLectures: total,
        present,
        absent,
        late,
        percentage:
          total > 0
            ? Number((((present + late) / total) * 100).toFixed(2))
            : null,
        records: records.map(sanitizeRecord),
      };
    }

    return context;
  }

  // FACULTY
  if (role === "faculty") {
    if (attendanceQuestion) {
      const records = await Attendance.find({
        facultyId: account._id,
      })
        .select(
          "studentName studentId date status department course semester"
        )
        .sort({ date: -1 })
        .limit(100)
        .lean();

      context.myFacultyAttendanceRecords =
        records.map(sanitizeRecord);
      context.returnedAttendanceRecords = records.length;
    }

    return context;
  }

  // HOD: limit queries to the HOD's department.
  if (role === "hod") {
    const hodQuery = account.email
      ? {
          email: {
            $regex: `^${escapeRegex(account.email)}$`,
            $options: "i",
          },
        }
      : { _id: null };

    const hod = await HOD.findOne(hodQuery).lean();
    const department = hod?.department || account.department;

    if (!department) {
      return {
        error:
          "Your department is not available in your account records.",
      };
    }

    context.myDepartment = department;

    if (countQuestion) {
      const [students, faculty] = await Promise.all([
        Student.countDocuments({ department }),
        Faculty.countDocuments({ department }),
      ]);

      context.departmentCounts = {
        studentProfiles: students,
        facultyProfiles: faculty,
      };
    }

    if (attendanceQuestion) {
      const records = await Attendance.find({ department })
        .select(
          "studentName date status department course semester facultyName"
        )
        .sort({ date: -1 })
        .limit(100)
        .lean();

      context.departmentAttendance = {
        returnedRecordCount: records.length,
        present: records.filter(
          (record) =>
            String(record.status || "").toLowerCase() === "present"
        ).length,
        absent: records.filter(
          (record) =>
            String(record.status || "").toLowerCase() === "absent"
        ).length,
        late: records.filter(
          (record) =>
            String(record.status || "").toLowerCase() === "late"
        ).length,
        records: records.map(sanitizeRecord),
      };
    }

    return context;
  }

  return context;
}

// AI ASSISTANT API
router.post("/ask", authMiddleware, async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.error("[AI] GEMINI_API_KEY is missing.");

      return res.status(500).json({
        success: false,
        message: "AI configuration is missing. Contact the administrator.",
      });
    }

    const message =
      typeof req.body?.message === "string"
        ? req.body.message.trim()
        : "";

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Please enter a message.",
      });
    }

    if (message.length > 4000) {
      return res.status(400).json({
        success: false,
        message: "Please keep your message under 4000 characters.",
      });
    }

    const role = normalizeRole(req.user?.role);

    if (!["student", "faculty", "hod", "admin"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Your account role is not authorized to use this assistant.",
      });
    }

    console.log(`[AI] Request received. Role: ${role}`);

    const databaseContext = await getDatabaseContext(
      req.user,
      message
    );

    const prompt = `
You are the Smart College ERP AI Assistant.

USER ROLE:
${role}

ROLE INSTRUCTIONS:
${getRoleInstruction(role)}

DATABASE RESULTS:
${JSON.stringify(databaseContext, null, 2)}

IMPORTANT RULES:
1. Answer in clear, simple language.
2. Answer general educational questions normally.
3. Use supplied database results for college-specific questions.
4. Never invent names, emails, phone numbers, departments, semesters,
   counts, attendance or other database details.
5. If a requested database field is missing, say it is not available.
6. Never reveal another student's private information to a student.
7. A student may only see their own personal record and attendance.
8. Faculty and HOD answers must stay within the data supplied to them.
9. For student account counts, use databaseCounts.studentAccounts.
10. For student profile counts, use databaseCounts.studentProfiles.
11. For faculty account counts, use databaseCounts.facultyAccounts.
12. For faculty profile counts, use databaseCounts.facultyProfiles.
13. For HOD account counts, use databaseCounts.hodAccounts.
14. For HOD profile counts, use databaseCounts.hodProfiles.
15. Do not add counts from different collections together.
16. A null attendance percentage means no attendance records were found.
17. If the database results do not contain the requested information,
    explain that the information is not currently available to this assistant.
18. Do not claim that you checked a timetable, assignment, result or any
    other collection unless that information is present in the database results.
19. Format lists clearly and keep answers easy to understand.

USER QUESTION:
${message}
`;

    const reply = await generateGeminiResponse(prompt);

    return res.status(200).json({
      success: true,
      reply,
      role,
    });
  } catch (error) {
    console.error("[AI Assistant error]", {
      message: error?.message,
      status: error?.status,
      code: error?.code,
    });

    const status = Number(error?.status || error?.code || 0);
    const errorMessage = String(error?.message || "").toLowerCase();

    if (
      status === 429 ||
      status === 503 ||
      status === 502 ||
      status === 504 ||
      /quota|rate.?limit|overloaded|temporarily unavailable/i.test(
        errorMessage
      )
    ) {
      return res.status(503).json({
        success: false,
        message: "AI is busy or the API quota is limited. Please try again shortly.",
      });
    }

    if (
      status === 401 ||
      status === 403 ||
      /api key|api_key|unauthorized|permission denied/i.test(errorMessage)
    ) {
      return res.status(502).json({
        success: false,
        message:
          "Gemini API authentication failed. Please check the server API key.",
      });
    }

    if (
      status === 404 ||
      /model.*not found|not found.*model/i.test(errorMessage)
    ) {
      return res.status(502).json({
        success: false,
        message:
          "The configured Gemini models are unavailable. Check the server terminal for the model error.",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Unable to get an AI response. Check the server terminal for the exact error.",
    });
  }
});

module.exports = router;
