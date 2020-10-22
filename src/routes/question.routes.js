module.exports = app => {
    const questions = require("../controllers/question.controller");
    const answers = require("../controllers/answer.controller");

    const router = require("express").Router();
    const router1 = require("express").Router();

    router.post("/", questions.create);

    router.get("/:question_id", questions.getQuestion);

    router.delete("/:question_id", questions.deleteQuestion);

    router.put("/:question_id", questions.updateQuestion);

    router.post("/:question_id/file", questions.attachFile);

    router.delete("/:question_id/file/:file_id", questions.deleteFile);


    router.post("/:question_id/answer", answers.create);

    router.post("/:question_id/answer/:answer_id/file", answers.attachFile);

    router.delete("/:question_id/answer/:answer_id/file/:file_id", answers.deleteFile);

    router.get("/:question_id/answer/:answer_id", answers.getAnswerOne);

    router.put("/:question_id/answer/:answer_id", answers.updateAnswer);

    router.delete("/:question_id/answer/:answer_id", answers.deleteAnswer);

    app.use('/v1/questions', router1.get("", questions.getAllQuestions));

    app.use('/v1/question', router);
};