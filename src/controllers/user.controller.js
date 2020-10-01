const db = require("../models");
const User = db.users;
const Op = db.Sequelize.Op;
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const _ = require('underscore');
const auth = require('basic-auth')
const joi = require('joi');
const passwordComplexity = require("joi-password-complexity");


// Create and Save a new User
exports.create = async (req, res) => {
    const { password } = req.body;

    const schema = joi.object().keys({
       first_name: joi.string().min(3).required(),
        last_name: joi.string().min(3).required(),
        email_address: joi.string().email().required(),
        password: joi.string().min(8).required()
    });

    let validation = schema.validate(req.body);
    if(validation.error) return res.status(400).send({Error: validation.error.details[0].message});

    const label = "Password";
    validation = passwordComplexity(undefined, label).validate(password);
    if(validation.error) return res.status(400).send({Error: validation.error.details[0].message});


    let result = await User.findOne({where: {email_address: req.body.email_address}});
    if(result) return  res.status(400).send({Error: "User already exist"});


    const user = _.pick(req.body,['first_name','last_name','email_address','password']);
    user.id = uuidv4();
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password,salt);

    User.create(user)
        .then(data => {
            res.status(201).send(_.pick(data,['id','first_name','last_name','email_address','account_created','account_updated']));
        })
        .catch(err => {
            res.status(500).send({
                message:
                    err.message || "Some error occurred while creating the Tutorial."
            });
        });
};


exports.findOne = async (req, res) => {
    const credentials = auth(req);

    if (!credentials || !await check(credentials.name, credentials.pass)) {
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
    } else {
        let user = await User.findOne({where: {email_address: credentials.name}});
        user = _.pick(user, ['id','first_name','last_name','email_address','account_created','account_updated']);
        res.status(200).send(user);
    }
};

async function check (name, pass) {
    let result = await User.findOne({where: {email_address: name}});
    if(!result) return false;

    result = await bcrypt.compare(pass,result.password);
    if(!result) return false;

    return true;
}

exports.update = async (req, res) => {
    const credentials = auth(req);
    if (!credentials || !await check(credentials.name, credentials.pass)) {
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
    } else {
        if(req.body.constructor === Object && Object.keys(req.body).length === 0)
            return res.status(400).send({Error: "Incomplete Information"})

        const { account_created, account_updated, id , email_address} = req.body;
        if(account_created || account_updated || id || email_address)
            return res.status(400).send({Error: "User cannot update their email, id, or account's timestamps"})

        const { first_name, last_name, password} = req.body;

        if(!first_name && !last_name && !password)
            return res.status(400).send({Error: 'Request body should either first_name, last_name or password'})

        let listOfKeys = Object.keys(req.body);

        let i = 0;
        for(;i<listOfKeys.length;i++){
            if(req.body[listOfKeys[i]].length == 0)
                return res.status(400).send({Error: 'Parameters should not be empty'});
        }

        let oldUser = await User.findOne({where: {email_address: credentials.name}});
        if(!oldUser) return res.status(500).send({Error: "Internal error"});

        let userToUpdate = _.pick(oldUser,['first_name','last_name','id','email_address','password'])

        for(i=0;i<listOfKeys.length;i++){
            if(listOfKeys[i].toString() === "password"){
                const label = "Password";
                const validation = passwordComplexity(undefined, label).validate(password);
                if(validation.error) return res.status(400).send({Error: validation.error.details[0].message});

                const salt = await bcrypt.genSalt(10);
                userToUpdate.password = await bcrypt.hash(password,salt);

            }else{
                userToUpdate[listOfKeys[i]] = req.body[listOfKeys[i]]
            }
        }

        let result = await User.update(userToUpdate, { where: {email_address: credentials.name}});
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
