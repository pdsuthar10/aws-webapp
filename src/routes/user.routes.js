module.exports = app => {
    const users = require("../controllers/user.controller.js");

    const router = require("express").Router();

    router.post("/", users.create);

    router.get("/self", users.findOne);

    router.get("/checkAuthorization", users.isAuthorized);

    router.post("/generateHash", users.generateHash);

    router.put("/self", users.update);

    router.get("/:user_id", users.getUser);


    app.use('/v1/user', router);
};