const express = require("express");
const mongoose = require("mongoose");

const Result = require("../models/Result");
const User = require("../models/User");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();


// ============================================================
// HELPER: GRADE
// ============================================================

function calculateGrade(total, isComplete) {
  if (!isComplete) {
    return "Pending";
  }

  if (total >= 90) return "A+";
  if (total >= 80) return "A";
  if (total >= 70) return "B+";
  if (total >= 60) return "B";
  if (total >= 50) return "C";
  if (total >= 40) return "D";

  return "F";
}


// ============================================================
// HELPER: STATUS
// ============================================================

function calculateStatus(total, isComplete) {
  if (!isComplete) {
    return "Pending";
  }

  return total >= 50
    ? "Pass"
    : "Fail";
}


// ============================================================
// HELPER: OPTIONAL MARK
// ============================================================

function convertMark(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return number;
}


// ============================================================
// CALCULATE RESULT MARKS
//
// Internal Exam = 30
// Attendance     = 10
// Activity       = 10
// Internal Total = 50
//
// External Exam  = 50
//
// Final Total    = 100
// ============================================================

function calculateResultMarks(
  internalExam,
  attendance,
  activity,
  externalExam
) {
  const internalExamMark =
    convertMark(internalExam);

  const attendanceMark =
    convertMark(attendance);

  const activityMark =
    convertMark(activity);

  const externalExamMark =
    convertMark(externalExam);


  // ==========================================================
  // VALIDATION
  // ==========================================================

  if (
    internalExamMark !== null &&
    (
      internalExamMark < 0 ||
      internalExamMark > 30
    )
  ) {
    throw new Error(
      "Internal Exam marks must be between 0 and 30."
    );
  }


  if (
    attendanceMark !== null &&
    (
      attendanceMark < 0 ||
      attendanceMark > 10
    )
  ) {
    throw new Error(
      "Attendance marks must be between 0 and 10."
    );
  }


  if (
    activityMark !== null &&
    (
      activityMark < 0 ||
      activityMark > 10
    )
  ) {
    throw new Error(
      "Activity marks must be between 0 and 10."
    );
  }


  if (
    externalExamMark !== null &&
    (
      externalExamMark < 0 ||
      externalExamMark > 50
    )
  ) {
    throw new Error(
      "External Exam marks must be between 0 and 50."
    );
  }


  // ==========================================================
  // INTERNAL TOTAL
  // ==========================================================

  const internalTotal =
    (internalExamMark ?? 0) +
    (attendanceMark ?? 0) +
    (activityMark ?? 0);


  // ==========================================================
  // INTERNAL COMPLETE
  // ==========================================================

  const internalComplete =
    internalExamMark !== null &&
    attendanceMark !== null &&
    activityMark !== null;


  // ==========================================================
  // EXTERNAL COMPLETE
  // ==========================================================

  const externalComplete =
    externalExamMark !== null;


  // ==========================================================
  // FINAL COMPLETE
  // ==========================================================

  const isComplete =
    internalComplete &&
    externalComplete;


  // ==========================================================
  // FINAL TOTAL
  // ==========================================================

  const finalTotal =
    internalTotal +
    (externalExamMark ?? 0);


  // ==========================================================
  // GRADE
  // ==========================================================

  const grade =
    calculateGrade(
      finalTotal,
      isComplete
    );


  // ==========================================================
  // STATUS
  // ==========================================================

  const status =
    calculateStatus(
      finalTotal,
      isComplete
    );


  return {
    internalExam:
      internalExamMark,

    attendance:
      attendanceMark,

    activity:
      activityMark,

    internalTotal,

    externalExam:
      externalExamMark,

    externalTotal:
      externalExamMark,

    finalTotal,

    grade,

    status,

    internalComplete,

    externalComplete,

    isComplete,
  };
}


// ============================================================
// GET ALL RESULTS
//
// Faculty → own results
// HOD     → department results
// Admin   → all results
// Student → ONLY own results
// ============================================================

router.get(
  "/",
  authMiddleware,
  async (req, res) => {
    try {

      // ======================================================
      // FIND LOGGED-IN USER
      // ======================================================

      const user =
        await User.findById(
          req.user.id
        ).select(
          "name role department studentId enrollmentNo course semester"
        );


      if (!user) {
        return res.status(404).json({
          message:
            "User not found.",
        });
      }


      let query = {};


      // ======================================================
      // FACULTY
      // ======================================================

      if (
        user.role === "faculty"
      ) {

        query.facultyId =
          user._id;

      }


      // ======================================================
      // HOD
      // ======================================================

      else if (
        user.role === "hod"
      ) {

        query.department =
          user.department;

      }


      // ======================================================
      // STUDENT
      //
      // VERY IMPORTANT
      // Student gets ONLY own results.
      // ======================================================

      else if (
        user.role === "student"
      ) {

        query.studentId =
          user._id;

      }


      // ======================================================
      // ADMIN
      //
      // Admin gets all results.
      // ======================================================

      else if (
        user.role === "admin"
      ) {

        query = {};

      }


      // ======================================================
      // UNKNOWN ROLE
      // ======================================================

      else {

        return res.status(403).json({
          message:
            "Access denied.",
        });

      }


      // ======================================================
      // FETCH RESULTS
      // ======================================================

      const results =
        await Result.find(query)
          .populate(
            "studentId",
            "name email studentId enrollmentNo course semester department"
          )
          .populate(
            "facultyId",
            "name email department designation"
          )
          .sort({
            semester: 1,
            subject: 1,
            studentName: 1,
          })
          .lean();


      console.log(
        `RESULTS FETCHED | ROLE: ${user.role} | COUNT: ${results.length}`
      );


      return res.status(200).json(
        results
      );

    } catch (error) {

      console.error(
        "Get Results Error:",
        error
      );


      return res.status(500).json({
        message:
          error.message,
      });

    }
  }
);


// ============================================================
// GET SINGLE RESULT
//
// Faculty → own result
// HOD     → own department
// Admin   → any result
// Student → ONLY own result
// ============================================================

router.get(
  "/:id",
  authMiddleware,
  roleMiddleware(
    "faculty",
    "hod",
    "admin",
    "student"
  ),
  async (req, res) => {

    try {

      // ======================================================
      // ID VALIDATION
      // ======================================================

      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {

        return res.status(400).json({
          message:
            "Invalid result ID.",
        });

      }


      // ======================================================
      // FIND RESULT
      // ======================================================

      const result =
        await Result.findById(
          req.params.id
        );


      if (!result) {

        return res.status(404).json({
          message:
            "Result not found.",
        });

      }


      // ======================================================
      // STUDENT SECURITY
      //
      // Student can ONLY see own result.
      // ======================================================

      if (
        req.user.role ===
        "student"
      ) {

        if (
          result.studentId.toString() !==
          req.user.id
        ) {

          return res.status(403).json({
            message:
              "Access denied.",
          });

        }

      }


      // ======================================================
      // FACULTY SECURITY
      //
      // Faculty can ONLY see own entered result.
      // ======================================================

      if (
        req.user.role ===
        "faculty"
      ) {

        if (
          result.facultyId.toString() !==
          req.user.id
        ) {

          return res.status(403).json({
            message:
              "Access denied.",
          });

        }

      }


      // ======================================================
      // HOD SECURITY
      // ======================================================

      if (
        req.user.role ===
        "hod"
      ) {

        const hod =
          await User.findById(
            req.user.id
          ).select(
            "department"
          );


        if (
          !hod ||
          hod.department
            ?.trim()
            .toLowerCase() !==
          result.department
            ?.trim()
            .toLowerCase()
        ) {

          return res.status(403).json({
            message:
              "Access denied.",
          });

        }

      }


      // ======================================================
      // RETURN RESULT
      // ======================================================

      return res.status(200).json(
        result
      );

    } catch (error) {

      console.error(
        "Get Single Result Error:",
        error
      );


      return res.status(500).json({
        message:
          error.message,
      });

    }
  }
);


// ============================================================
// CREATE / UPDATE RESULT
//
// Faculty only.
//
// Internal:
// internalExam /30
// attendance   /10
// activity     /10
//
// External:
// externalExam /50
//
// Existing marks are preserved if field is blank.
// ============================================================

router.post(
  "/",
  authMiddleware,
  roleMiddleware("faculty"),
  async (req, res) => {

    try {

      const {
        studentId,
        semester,
        subject,
        examType,

        internalExam,
        attendance,
        activity,
        externalExam,

      } = req.body;


      // ======================================================
      // BASIC VALIDATION
      // ======================================================

      if (
        !studentId ||
        !semester ||
        !subject ||
        !examType
      ) {

        return res.status(400).json({
          message:
            "Student, semester, subject and exam type are required.",
        });

      }


      // ======================================================
      // STUDENT ID VALIDATION
      // ======================================================

      if (
        !mongoose.Types.ObjectId.isValid(
          studentId
        )
      ) {

        return res.status(400).json({
          message:
            "Invalid student ID.",
        });

      }


      // ======================================================
      // FIND FACULTY
      // ======================================================

      const faculty =
        await User.findOne({
          _id:
            req.user.id,

          role:
            "faculty",
        });


      if (!faculty) {

        return res.status(404).json({
          message:
            "Faculty not found.",
        });

      }


      // ======================================================
      // FIND STUDENT
      // ======================================================

      const student =
        await User.findOne({
          _id:
            studentId,

          role:
            "student",
        });


      if (!student) {

        return res.status(404).json({
          message:
            "Student not found.",
        });

      }


      // ======================================================
      // DEPARTMENT SECURITY
      // ======================================================

      const facultyDepartment =
        faculty.department
          ?.trim()
          .toLowerCase();


      const studentDepartment =
        student.department
          ?.trim()
          .toLowerCase();


      if (
        !facultyDepartment ||
        !studentDepartment ||
        facultyDepartment !==
        studentDepartment
      ) {

        return res.status(403).json({
          message:
            "You can enter marks only for students from your department.",
        });

      }


      // ======================================================
      // FIND EXISTING RESULT
      // ======================================================

      const existingResult =
        await Result.findOne({
          studentId:
            student._id,

          semester:
            semester.trim(),

          subject:
            subject.trim(),

          examType:
            examType.trim(),
        });


      // ======================================================
      // EXISTING RESULT
      // ======================================================

      if (existingResult) {

        // ====================================================
        // SECURITY
        //
        // Existing result must belong to this faculty.
        // ====================================================

        if (
          existingResult.facultyId.toString() !==
          faculty._id.toString()
        ) {

          return res.status(403).json({
            message:
              "You cannot update marks entered by another faculty.",
          });

        }


        // ====================================================
        // UPDATE ONLY PROVIDED MARKS
        // ====================================================

        if (
          internalExam !==
            undefined &&
          internalExam !==
            null &&
          internalExam !==
            ""
        ) {

          existingResult.internalExam =
            Number(internalExam);

        }


        if (
          attendance !==
            undefined &&
          attendance !==
            null &&
          attendance !==
            ""
        ) {

          existingResult.attendance =
            Number(attendance);

        }


        if (
          activity !==
            undefined &&
          activity !==
            null &&
          activity !==
            ""
        ) {

          existingResult.activity =
            Number(activity);

        }


        if (
          externalExam !==
            undefined &&
          externalExam !==
            null &&
          externalExam !==
            ""
        ) {

          existingResult.externalExam =
            Number(externalExam);

        }


        // ====================================================
        // RECALCULATE
        // ====================================================

        const calculated =
          calculateResultMarks(
            existingResult.internalExam,
            existingResult.attendance,
            existingResult.activity,
            existingResult.externalExam
          );


        existingResult.internalExam =
          calculated.internalExam;

        existingResult.attendance =
          calculated.attendance;

        existingResult.activity =
          calculated.activity;

        existingResult.internalTotal =
          calculated.internalTotal;

        existingResult.externalExam =
          calculated.externalExam;

        existingResult.externalTotal =
          calculated.externalTotal;

        existingResult.total =
          calculated.finalTotal;

        existingResult.grade =
          calculated.grade;

        existingResult.status =
          calculated.status;


        await existingResult.save();


        return res.status(200).json({
          message:
            "Marks updated successfully.",

          result:
            existingResult,
        });

      }


      // ======================================================
      // NEW RESULT
      // ======================================================

      const calculated =
        calculateResultMarks(
          internalExam,
          attendance,
          activity,
          externalExam
        );


      // ======================================================
      // STUDENT CODE
      // ======================================================

      const studentCode =
        student.studentId ||
        student.enrollmentNo ||
        student._id.toString();


      // ======================================================
      // CREATE RESULT
      // ======================================================

      const result =
        await Result.create({

          studentId:
            student._id,

          studentCode:
            studentCode,

          studentName:
            student.name,

          department:
            student.department,

          course:
            student.course ||
            faculty.department ||
            "Course",

          semester:
            semester.trim(),

          subject:
            subject.trim(),

          examType:
            examType.trim(),


          // ==================================================
          // INTERNAL
          // ==================================================

          internalExam:
            calculated.internalExam,

          attendance:
            calculated.attendance,

          activity:
            calculated.activity,

          internalTotal:
            calculated.internalTotal,


          // ==================================================
          // EXTERNAL
          // ==================================================

          externalExam:
            calculated.externalExam,

          externalTotal:
            calculated.externalTotal,


          // ==================================================
          // FINAL
          // ==================================================

          total:
            calculated.finalTotal,

          grade:
            calculated.grade,

          status:
            calculated.status,


          // ==================================================
          // FACULTY
          // ==================================================

          facultyId:
            faculty._id,

          facultyName:
            faculty.name,
        });


      return res.status(201).json({

        message:
          "Marks saved successfully.",

        result,
      });

    } catch (error) {

      console.error(
        "Create Result Error:",
        error
      );


      // ======================================================
      // DUPLICATE
      // ======================================================

      if (
        error.code === 11000
      ) {

        return res.status(400).json({
          message:
            "Marks already exist for this student, subject, semester and exam type.",
        });

      }


      return res.status(400).json({
        message:
          error.message,
      });

    }
  }
);


// ============================================================
// UPDATE RESULT
//
// Faculty can update ONLY own result.
// ============================================================

router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("faculty"),
  async (req, res) => {

    try {

      const {
        internalExam,
        attendance,
        activity,
        externalExam,

        semester,
        subject,
        examType,

      } = req.body;


      // ======================================================
      // ID VALIDATION
      // ======================================================

      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {

        return res.status(400).json({
          message:
            "Invalid result ID.",
        });

      }


      // ======================================================
      // FIND OWN RESULT
      // ======================================================

      const result =
        await Result.findOne({
          _id:
            req.params.id,

          facultyId:
            req.user.id,
        });


      if (!result) {

        return res.status(404).json({
          message:
            "Result not found or you do not have permission to edit it.",
        });

      }


      // ======================================================
      // UPDATE PROVIDED MARKS
      // ======================================================

      if (
        internalExam !==
          undefined &&
        internalExam !==
          null &&
        internalExam !==
          ""
      ) {

        result.internalExam =
          Number(internalExam);

      }


      if (
        attendance !==
          undefined &&
        attendance !==
          null &&
        attendance !==
          ""
      ) {

        result.attendance =
          Number(attendance);

      }


      if (
        activity !==
          undefined &&
        activity !==
          null &&
        activity !==
          ""
      ) {

        result.activity =
          Number(activity);

      }


      if (
        externalExam !==
          undefined &&
        externalExam !==
          null &&
        externalExam !==
          ""
      ) {

        result.externalExam =
          Number(externalExam);

      }


      // ======================================================
      // NEW BASIC VALUES
      // ======================================================

      const newSemester =
        semester?.trim() ||
        result.semester;

      const newSubject =
        subject?.trim() ||
        result.subject;

      const newExamType =
        examType?.trim() ||
        result.examType;


      // ======================================================
      // DUPLICATE CHECK
      // ======================================================

      const duplicate =
        await Result.findOne({

          _id: {
            $ne:
              result._id,
          },

          studentId:
            result.studentId,

          semester:
            newSemester,

          subject:
            newSubject,

          examType:
            newExamType,
        });


      if (duplicate) {

        return res.status(400).json({
          message:
            "Another result already exists with the same student, semester, subject and exam type.",
        });

      }


      // ======================================================
      // RECALCULATE
      // ======================================================

      const calculated =
        calculateResultMarks(
          result.internalExam,
          result.attendance,
          result.activity,
          result.externalExam
        );


      result.internalExam =
        calculated.internalExam;

      result.attendance =
        calculated.attendance;

      result.activity =
        calculated.activity;

      result.internalTotal =
        calculated.internalTotal;

      result.externalExam =
        calculated.externalExam;

      result.externalTotal =
        calculated.externalTotal;

      result.total =
        calculated.finalTotal;

      result.grade =
        calculated.grade;

      result.status =
        calculated.status;

      result.semester =
        newSemester;

      result.subject =
        newSubject;

      result.examType =
        newExamType;


      await result.save();


      return res.status(200).json({

        message:
          "Marks updated successfully.",

        result,
      });

    } catch (error) {

      console.error(
        "Update Result Error:",
        error
      );


      if (
        error.code === 11000
      ) {

        return res.status(400).json({
          message:
            "Duplicate result for this student, subject, semester and exam type.",
        });

      }


      return res.status(400).json({
        message:
          error.message,
      });

    }
  }
);


// ============================================================
// DELETE RESULT
//
// Faculty can delete ONLY own result.
// ============================================================

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("faculty"),
  async (req, res) => {

    try {

      // ======================================================
      // ID VALIDATION
      // ======================================================

      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {

        return res.status(400).json({
          message:
            "Invalid result ID.",
        });

      }


      // ======================================================
      // DELETE OWN RESULT
      // ======================================================

      const result =
        await Result.findOneAndDelete({

          _id:
            req.params.id,

          facultyId:
            req.user.id,
        });


      if (!result) {

        return res.status(404).json({
          message:
            "Result not found or you do not have permission.",
        });

      }


      return res.status(200).json({
        message:
          "Result deleted successfully.",
      });

    } catch (error) {

      console.error(
        "Delete Result Error:",
        error
      );


      return res.status(500).json({
        message:
          error.message,
      });

    }
  }
);


module.exports = router;