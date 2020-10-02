module.exports = app => {
    const users = require("../controllers/user.controller.js");

    const router = require("express").Router();

    router.post("/", users.create);

    router.get("/:user_id", users.getUser);

    router.get("/checkAuthorization", users.isAuthorized);

    router.post("/generateHash", users.generateHash);

    router.get("/self", users.findOne);

    router.put("/self", users.update);

    app.use('/v1/users', router);
};