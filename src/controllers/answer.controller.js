const db = require("../models");
const Question = db.questions;
const Op = db.Sequelize.Op;
const User = db.users;
const { v4: uuidv4 } = require('uuid');
const Category = db.categories;
const Answer = db.answers;
const File = db.files;
const auth = require('basic-auth')
const joi = require('joi');
const bcrypt = require('bcrypt');
const multer = require('multer');
const multerS3 = require('multer-s3');
const aws = require('aws-sdk');
const s3 = new aws.S3();
const path = require('path');

async function check (name, pass) {
    let result = await User.findOne({where: {username: name}});
    if(!result) return false;

    result = await bcrypt.compare(pass,result.password);
    if(!result) return false;

    return true;
}

exports.create = async (req, res) => {
    const credentials = auth(req);

    if (!credentials || !await check(credentials.name, credentials.pass)) {
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
        return;
    }

    const user = await User.findOne({ where: { username: credentials.name}})

    const question = await Question.findByPk(req.params.question_id);
    if(!question) return res.status(404).send({Error: "Question not found"})

    const schema = joi.object().keys({
        answer_text: joi.string().min(1).required()
    });

    const validation = schema.validate(req.body);
    if(validation.error) return res.status(400).send({Error: validation.error.details[0].message});


    let answer = await Answer.create({
        answer_id: uuidv4(),
        answer_text: req.body.answer_text
    })
    if(!answer) return res.status(500).send({Error: "Internal error"})

    await question.addAnswer(answer)
    await user.addAnswer(answer)

    answer = await Answer.findOne({ where : {answer_id: answer.answer_id}});

    res.status(201).send(answer)
}

exports.getAnswerOne = async (req,res) => {
    const question = await Question.findByPk(req.params.question_id);
    if(!question) return res.status(404).send({Error: "Question not found"})

    const answer = await question.getAnswers( { where: {answer_id: req.params.answer_id}})
    if(answer.length === 0) return res.status(404).send({Error: "Answer not found for this question"})

    return res.status(200).send(answer[0])

}

exports.updateAnswer = async (req,res) => {
    const credentials = auth(req);

    if (!credentials || !await check(credentials.name, credentials.pass)) {
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
        return;
    }
    const user = await User.findOne({ where: { username: credentials.name}})

    const question = await Question.findByPk(req.params.question_id)
    if(!question) return res.status(404).send({Error: "Question Not found"})

    // const answer = await Answer.findByPk(req.params.answer_id)
    let answer = await question.getAnswers({ where: {answer_id: req.params.answer_id}});
    if(answer.length === 0) return res.status(404).send({Error: "Answer not found for this question"})

    answer = answer[0];
    if(answer.user_id !== user.id) return res.status(401).send({Error: "User unauthorised"})

    const schema = joi.object().keys({
        answer_text: joi.string().min(1).required()
    });

    const validation = schema.validate(req.body);
    if(validation.error) return res.status(400).send({Error: validation.error.details[0].message});

    await Answer.update(
        { answer_text: req.body.answer_text },
        {
            where: { answer_id: req.params.answer_id}
        })

    return res.status(204).send();
}

exports.deleteAnswer = async (req, res) => {
    const credentials = auth(req);

    if (!credentials || !await check(credentials.name, credentials.pass)) {
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
        return;
    }
    const user = await User.findOne({ where: { username: credentials.name}})

    const question = await Question.findByPk(req.params.question_id)
    if(!question) return res.status(404).send({Error: "Question Not found"})

    let answer = await question.getAnswers({ where: {answer_id: req.params.answer_id}});
    if(answer.length === 0) return res.status(404).send({Error: "Answer not found for given question"})

    answer = answer[0];
    if(answer.user_id !== user.id) return res.status(401).send({Error: "User unauthorised"})

    await user.removeAnswer(answer)
    await question.removeAnswer(answer)

    await Answer.destroy({where: { answer_id: req.params.answer_id}})

    return res.status(204).send()

}

exports.attachFile = async (req, res) =>{
    const credentials = auth(req);
    if (!credentials || !await check(credentials.name, credentials.pass)) {
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
        return;
    }
    let question = await Question.findByPk(req.params.question_id)
    if(!question) return res.status(404).send({Error: "Question not found"})

    let user = await User.findOne({where: {username: credentials.name}});

    let answer = await question.getAnswers({ where: {answer_id: req.params.answer_id}});
    if(answer.length === 0) return res.status(404).send({Error: "Answer not found for given question"})

    answer = answer[0];
    if(answer.user_id !== user.id) return res.status(401).send({Error: "User unauthorised"})


    const upload = multer({
        storage: multerS3({
            s3: s3,
            bucket: 'webapp.priyam.suthar',
            metadata: function (req, file, cb) {
                cb(null, Object.assign({}, req.body));
            },
            key: function (req, file, cb) {
                cb(null, req.params.question_id + "/" +req.params.answer_id + "/" + path.basename( file.originalname, path.extname( file.originalname ) ) + path.extname( file.originalname ) )
            }
        }),
        limits:{ fileSize: 2000000 }, // In bytes: 2000000 bytes = 2 MB
        fileFilter: function( req, file, cb ){
            checkFileType( file, cb );
        }
    })

    const singleUpload = upload.single('image');
    await singleUpload(req, res, async (err) => {
        if(err) return res.status(400).send({Error: 'Images only!'})
        if(!req.file) return res.status(400).send({Error: 'No File Uploaded'})

        // console.log(req.file);
        const fileToAttach = {
            file_name: req.file.originalname,
            file_id: uuidv4(),
            s3_object_name: req.file.key
        }

        const file = await File.create(fileToAttach);
        await answer.addAttachment(file);

        return res.status(201).send(file);

    })

}

function checkFileType( file, cb ){
    // Allowed ext
    const filetypes = /jpeg|jpg|png/;
    // Check ext
    const extname = filetypes.test( path.extname( file.originalname ).toLowerCase());
    // Check mime
    const mimetype = filetypes.test( file.mimetype );
    if( mimetype && extname ){
        return cb( null, true );
    } else {
        cb( 'Error' );
    }
}

exports.deleteFile = async (req, res) => {
    const credentials = auth(req);

    if (!credentials || !await check(credentials.name, credentials.pass)) {
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
        return;
    }

    const question = await Question.findByPk(req.params.question_id)
    if(!question) return res.status(404).send({Error: "Question Not found"})

    let user = await User.findOne({where: {username: credentials.name}});
    let answer = await question.getAnswers({ where: {answer_id: req.params.answer_id}});
    if(answer.length === 0) return res.status(404).send({Error: "Answer not found for given question"})

    answer = answer[0];
    if(answer.user_id !== user.id) return res.status(401).send({Error: "User unauthorised"})

    let file = await answer.getAttachments({ where: {file_id: req.params.file_id}})
    if(file.length === 0) return res.status(404).send({Error: "File not found for given answer"})

    file = file[0];

    await answer.removeAttachment(file);

    await File.destroy({where: {file_id: req.params.file_id}})

    let params = {
        Bucket: 'webapp.priyam.suthar',
        Key: file.s3_object_name
    }
    s3.deleteObject(params, function(err, data) {
        if (err) console.log(err, err.stack);  // error
        else    return res.status(204).send();   // deleted
    });

}




