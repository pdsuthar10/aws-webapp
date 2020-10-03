module.exports = app => {
    const questions = require("../controllers/question.controller");
    const answers = require("../controllers/answer.controller");

    const router = require("express").Router();

    router.post("/", questions.create);

    app.use('/v1/questions', router.get("", questions.getAllQuestions));

    router.get("/:question_id", questions.getQuestion);

    router.delete("/:question_id", questions.deleteQuestion);

    router.put("/:question_id", questions.updateQuestion);

    router.post("/:question_id/", answers.create);

    router.get("/:question_id/answer/:answer_id", answers.getAnswerOne);

    router.put("/:question_id/answer/:answer_id", answers.updateAnswer);

    router.delete("/:question_id/answer/:answer_id", answers.deleteAnswer);

    app.use('/v1/question', router);
};