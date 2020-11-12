const db = require("../models");
const User = db.users;
const Op = db.Sequelize.Op;
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const _ = require('underscore');
const auth = require('basic-auth')
const joi = require('joi');
const passwordComplexity = require("joi-password-complexity");
const config = require("../config/db.config.js");
const logger = require('../config/logger');
const SDC = require('statsd-client');
const sdc = new SDC({host: config.METRICS_HOSTNAME, port: config.METRICS_PORT});


// Create and Save a new User
exports.create = async (req, res) => {
    const start = Date.now();
    logger.info("POST user api call....");
    sdc.increment('endpoint.user.http.post');

    const { password } = req.body;

    const schema = joi.object().keys({
        first_name: joi.string().min(3).required(),
        last_name: joi.string().min(3).required(),
        username: joi.string().email().required(),
        password: joi.string().min(8).required()
    });

    let validation = schema.validate(req.body);
    if(validation.error) {
        logger.error("Input Error: " + validation.error.details[0].message);
        sdc.timing('timer.user.http.post.error', Date.now() - start)
        return res.status(400).send({Error: validation.error.details[0].message});
    }

    const label = "Password";
    validation = passwordComplexity(undefined, label).validate(password);
    if(validation.error) {
        logger.error("Password Input Error: " + validation.error.details[0].message);
        sdc.timing('timer.user.http.post.error', Date.now() - start)
        return res.status(400).send({Error: validation.error.details[0].message});
    }


    let result = await User.findOne({where: {username: req.body.username}});
    if(result) {
        logger.error("User already exist");
        sdc.timing('timer.user.http.post.error', Date.now() - start)
        return res.status(400).send({Error: "User already exist"});
    }


    const user = _.pick(req.body,['first_name','last_name','username','password']);
    user.id = uuidv4();
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password,salt);

    const dbStart = Date.now();
    User.create(user)
        .then(data => {
            logger.info("Success: User created successfully");
            res.status(201).send(_.pick(data,['id','first_name','last_name','username','account_created','account_updated']));
        })

    const end = Date.now();

    const dbElapsed = end - dbStart;
    sdc.timing('timer.user.db.create', dbElapsed)

    const elapsed = end - start;
    sdc.timing('timer.user.http.post', elapsed);
};

async function check (name, pass) {
    const start = Date.now()
    let result = await User.findOne({where: {username: name}});
    const end = Date.now()
    const elapsed = end - start;
    sdc.timing('timer.user.db.findOne', elapsed)
    if(!result) {
        logger.error("User not found!")
        return false;
    }

    result = await bcrypt.compare(pass,result.password);
    if(!result) {
        logger.error("Passwords do not match!")
        return false;
    }

    return true;
}

exports.findOne = async (req, res) => {
    logger.info("GET user by id api call.....")
    sdc.increment('endpoint.user.http.get.self')
    const startApi = Date.now()
    const credentials = auth(req);

    if (!credentials || !await check(credentials.name, credentials.pass)) {
        logger.error("Access denied")
        sdc.timing('timer.user.http.get.self.error', Date.now() - startApi)
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
    } else {
        const start = Date.now()
        let user = await User.findOne({where: {username: credentials.name}});
        const end = Date.now()
        const elapsed = end - start;
        sdc.timing('timer.user.db.findOne', elapsed)
        user = _.pick(user, ['id','first_name','last_name','username','account_created','account_updated']);
        res.status(200).send(user);
    }
    const endApi = Date.now()
    sdc.timing('timer.user.http.get.self', endApi - startApi);

};

exports.getUser = async (req,res) => {
    logger.info("User information api call from id.....")
    sdc.increment('endpoint.user.http.get.id')
    const startApi = Date.now()
    const startDb = Date.now()
    let user = await User.findByPk(req.params.user_id);
    const endDb = Date.now()
    const elapsedDb = endDb - startDb
    sdc.timing('timer.user.db.findByPk', elapsedDb)
    if(!user) {
        logger.error("User not found!")
        sdc.timing('timer.user.http.get.id.error', Date.now() - startApi)
        return res.status(404).send({Error: "User not found"})
    }

    const endApi = Date.now()
    sdc.timing('timer.user.http.get.id', endApi - startApi)
    return res.status(200).send(_.pick(user,['id','first_name','last_name','username','account_created','account_updated']));
}

exports.update = async (req, res) => {
    logger.info("PUT user api call....");
    sdc.increment('endpoint.user.http.update');
    const startApi = Date.now()
    const credentials = auth(req);
    if (!credentials || !await check(credentials.name, credentials.pass)) {
        logger.error("Access denied")
        sdc.timing('timer.user.http.update.error', Date.now() - startApi)
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
    } else {
        if(req.body.constructor === Object && Object.keys(req.body).length === 0) {
            logger.error("Incomplete Information")
            sdc.timing('timer.user.http.update.error', Date.now() - startApi)
            return res.status(400).send({Error: "Incomplete Information"})
        }

        const { account_created, account_updated, id , username} = req.body;
        if(account_created || account_updated || id || username) {
            logger.error("User cannot update their email, id, or account's timestamps")
            sdc.timing('timer.user.http.update.error', Date.now() - startApi)
            return res.status(400).send({Error: "User cannot update their email, id, or account's timestamps"})
        }

        const { first_name, last_name, password} = req.body;

        if(!first_name && !last_name && !password) {
            logger.error("Request body should either first_name, last_name or password")
            sdc.timing('timer.user.http.update.error', Date.now() - startApi)
            return res.status(400).send({Error: 'Request body should either first_name, last_name or password'})
        }

        let listOfKeys = Object.keys(req.body);

        let i = 0;
        for(;i<listOfKeys.length;i++){
            if(req.body[listOfKeys[i]].length == 0) {
                logger.error("Input parameters should not be empty")
                sdc.timing('timer.user.http.update.error', Date.now() - startApi)
                return res.status(400).send({Error: 'Parameters should not be empty'});
            }
        }

        let startDb = Date.now()
        let oldUser = await User.findOne({where: {username: credentials.name}});
        let endDb = Date.now()
        sdc.timing('timer.user.db.findOne', endDb - startDb)

        let userToUpdate = _.pick(oldUser,['first_name','last_name','id','username','password'])

        for(i=0;i<listOfKeys.length;i++){
            if(listOfKeys[i].toString() === "password"){
                const label = "Password";
                const validation = passwordComplexity(undefined, label).validate(password);
                if(validation.error) {
                    logger.error(validation.error.details[0].message)
                    sdc.timing('timer.user.http.update.error', Date.now() - startApi)
                    return res.status(400).send({Error: validation.error.details[0].message});
                }

                const salt = await bcrypt.genSalt(10);
                userToUpdate.password = await bcrypt.hash(password,salt);

            }else{
                userToUpdate[listOfKeys[i]] = req.body[listOfKeys[i]]
            }
        }

        startDb = Date.now()
        let result = await User.update(userToUpdate, { where: {username: credentials.name}});
        endDb = Date.now()
        sdc.timing('timer.user.db.update', endDb - startDb)

        const endApi = Date.now()
        sdc.timing('timer.user.http.update', endApi - startApi)
        if(!result) res.status(400).send({Error: `Cannot update the user with email: ${credentials.name}`})

        res.sendStatus(204)
    }
};

function validateEmail(email) {
    const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}

exports.isAuthorized = async (req, res) => {
    const credentials = auth(req);
    if (!credentials || !validateEmail(credentials.name)) {
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
    }
    else
        res.status(200).send({"Message":'Access granted'});
}

exports.generateHash = async (req, res) => {
    const salt = await bcrypt.genSalt(10);
    let user = {}
    user.password = await bcrypt.hash(req.body.password,salt);
    res.status(201).send(user);
}



