module.exports = app => {
    const questions = require("../controllers/question.controller");

    const router = require("express").Router();

    router.post("/", questions.create);

    app.use('/v1/question', router);
};