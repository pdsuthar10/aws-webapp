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
require('dotenv').config();
const config = require("../config/db.config.js");
const logger = require('../config/logger');
const SDC = require('statsd-client');
const sdc = new SDC({host: config.METRICS_HOSTNAME, port: config.METRICS_PORT});
aws.config.update({region: 'us-east-1'})
const SNS = new aws.SNS({apiVersion: '2010-03-31'});




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

exports.create = async (req, res) => {
    logger.info("POST answer api call.....")
    sdc.increment('endpoint.answer.http.post')
    let startApi = Date.now()
    const credentials = auth(req);

    if (!credentials || !await check(credentials.name, credentials.pass)) {
        logger.error("Access denied")
        sdc.timing('timer.answer.http.post.error', Date.now() - startApi)
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
        return;
    }

    let startDb = Date.now()
    const user = await User.findOne({ where: { username: credentials.name}})
    sdc.timing('timer.user.db.findOne', Date.now() - startDb)

    startDb = Date.now()
    const question = await Question.findByPk(req.params.question_id);
    sdc.timing('timer.question.db.findByPk', Date.now() - startDb)

    if(!question) {
        logger.error("Question not found")
        sdc.timing('timer.answer.http.post.error', Date.now() - startApi)
        return res.status(404).send({Error: "Question not found"})
    }

    const schema = joi.object().keys({
        answer_text: joi.string().min(1).required()
    });

    const validation = schema.validate(req.body);
    if(validation.error) {
        logger.error(validation.error.details[0].message)
        sdc.timing('timer.answer.http.post.error', Date.now() - startApi)
        return res.status(400).send({Error: validation.error.details[0].message});
    }


    startDb = Date.now()
    let answer = await Answer.create({
        answer_id: uuidv4(),
        answer_text: req.body.answer_text
    })
    await question.addAnswer(answer)
    await user.addAnswer(answer)
    logger.info("Answer created successfully!")
    sdc.timing('timer.answer.db.create', Date.now() - startDb)

    startDb = Date.now()
    answer = await Answer.findOne({
        where : {answer_id: answer.answer_id},
        include : {
            as: 'attachments',
            model: File,
            attributes: ['file_name','s3_object_name','file_id','created_date', 'LastModified', 'ContentLength', 'ETag']
        }
    });
    sdc.timing('timer.answer.db.findOne', Date.now() - startDb)
    sdc.timing('timer.answer.http.post', Date.now() - startApi)
    const userOfQuestion = await User.findOne({ where: { id: question.user_id }})

    const data = {
        ToAddresses: userOfQuestion.username,
        user: user,
        question: question,
        answer: answer,
        questionGetApi: "dev.suthar-priyam.me/v1/question/"+question.question_id,
        answerGetApi: "dev.suthar-priyam.me/v1/question/"+question.question_id+"/answer/"+answer.answer_id,
        type: "POST"
    }

    const params = {
        Message: JSON.stringify(data),
        TopicArn: "arn:aws:sns:us-east-1:315658802519:user_updates"
    }
    let publishTextPromise = SNS.publish(params).promise();
    publishTextPromise.then(
        function(data) {
            console.log(`Message sent to the topic ${params.TopicArn}`);
            console.log("MessageID is " + data.MessageId);
            res.status(201).send(answer)
        }).catch(
        function(err) {
            console.error(err, err.stack);
            res.status(500).send(err)
        });
}

exports.getAnswerOne = async (req,res) => {
    logger.info("GET answer by id api call.....")
    sdc.increment('endpoint.answer.http.getById')
    let startApi = Date.now()
    const question = await Question.findByPk(req.params.question_id);
    sdc.timing('timer.question.db.findByPk', Date.now() - startApi)
    if(!question) {
        logger.error("Question not found")
        sdc.timing('timer.answer.http.getById.error', Date.now() - startApi)
        return res.status(404).send({Error: "Question not found"})
    }

    let answer = await question.getAnswers( { where: {answer_id: req.params.answer_id}})
    if(answer.length === 0) {
        logger.error("Answer not found for this question")
        sdc.timing('timer.answer.http.getById.error', Date.now() - startApi)
        return res.status(404).send({Error: "Answer not found for this question"})
    }

    let startDb = Date.now()
    answer = await Answer.findByPk(req.params.answer_id,{
        include : {
            as: 'attachments',
            model: File,
            attributes: ['file_name','s3_object_name','file_id','created_date', 'LastModified', 'ContentLength', 'ETag']
        }
    })
    sdc.timing('timer.answer.db.findByPk', Date.now() - startDb)

    sdc.timing('timer.answer.http.getById', Date.now() - startApi)
    return res.status(200).send(answer)

}

exports.updateAnswer = async (req,res) => {
    logger.info("PUT answer api call.....")
    sdc.increment('endpoint.answer.http.put')
    let startApi = Date.now()
    const credentials = auth(req);

    if (!credentials || !await check(credentials.name, credentials.pass)) {
        logger.error("Access denied")
        sdc.timing('timer.answer.http.put.error', Date.now() - startApi)
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
        return;
    }

    let startDb = Date.now()
    const user = await User.findOne({ where: { username: credentials.name}})
    sdc.timing('timer.user.db.findOne', Date.now() - startDb)

    startDb = Date.now()
    const question = await Question.findByPk(req.params.question_id)
    sdc.timing('timer.question.db.findByPk', Date.now() - startDb)
    if(!question) {
        logger.error('Question not found')
        sdc.timing('timer.answer.http.put.error', Date.now() - startApi)
        return res.status(404).send({Error: "Question Not found"})
    }

    // const answer = await Answer.findByPk(req.params.answer_id)
    startDb = Date.now()
    let answer = await question.getAnswers({ where: {answer_id: req.params.answer_id}});
    sdc.timing('timer.answer.db.findByPk', Date.now() - startDb)
    if(answer.length === 0) {
        logger.error('Answer not found for this question')
        sdc.timing('timer.answer.http.put.error', Date.now() - startApi)
        return res.status(404).send({Error: "Answer not found for this question"})
    }

    answer = answer[0];
    if(answer.user_id !== user.id) {
        logger.error('User unauthorized')
        sdc.timing('timer.answer.http.put.error', Date.now() - startApi)
        return res.status(401).send({Error: "User unauthorised"})
    }

    const schema = joi.object().keys({
        answer_text: joi.string().min(1).required()
    });

    const validation = schema.validate(req.body);
    if(validation.error) {
        logger.error(validation.error.details[0].message)
        sdc.timing('timer.answer.http.put.error', Date.now() - startApi)
        return res.status(400).send({Error: validation.error.details[0].message});
    }

    startDb = Date.now()
    await Answer.update(
        { answer_text: req.body.answer_text },
        {
            where: { answer_id: req.params.answer_id}
        })
    sdc.timing('timer.answer.db.update', Date.now() - startDb)
    logger.info("Answer updated successfully")
    sdc.timing('timer.answer.http.put', Date.now() - startApi)
    return res.status(204).send();
}

exports.deleteAnswer = async (req, res) => {
    logger.info("DELETE answer api call.....")
    sdc.increment('endpoint.answer.http.delete')
    let startApi = Date.now()
    const credentials = auth(req);

    if (!credentials || !await check(credentials.name, credentials.pass)) {
        logger.error('Access denied')
        sdc.timing('timer.answer.http.delete.error', Date.now() - startApi)
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
        return;
    }
    const user = await User.findOne({ where: { username: credentials.name}})

    const question = await Question.findByPk(req.params.question_id)
    if(!question) {
        logger.error('Question not found')
        sdc.timing('timer.answer.http.delete.error', Date.now() - startApi)
        return res.status(404).send({Error: "Question Not found"})
    }

    let answer = await question.getAnswers({ where: {answer_id: req.params.answer_id}});
    if(answer.length === 0) {
        logger.error('Answer not found for given question')
        sdc.timing('timer.answer.http.delete.error', Date.now() - startApi)
        return res.status(404).send({Error: "Answer not found for given question"})
    }

    answer = answer[0];
    if(answer.user_id !== user.id) {
        logger.error('User unauthorised')
        sdc.timing('timer.answer.http.delete.error', Date.now() - startApi)
        return res.status(401).send({Error: "User unauthorised"})
    }

    let startDb = Date.now()
    await user.removeAnswer(answer)
    await question.removeAnswer(answer)
    let files = await answer.getAttachments()
    for(let i=0;i<files.length;i++){
        let startTemp = Date.now()
        await File.destroy({where: {file_id: files[i].file_id}})
        sdc.timing('timer.answer.file.db.delete', Date.now() - startFile)

        let params = {
            Bucket: process.env.BUCKET_NAME,
            Key: files[i].s3_object_name
        }
        startTemp = Date.now()
        s3.deleteObject(params, function(err, data) {
            if (err) {
                logger.error('Error deleting file for answer in S3')
                sdc.timing('timer.answer.file.S3.delete.error', Date.now() - startTemp)
                console.log(err, err.stack);
            }  // error
            else {
                logger.info('File deleted for given answer in S3')
                sdc.timing('timer.answer.file.S3.delete', Date.now() - startTemp)
                return
            };   // deleted
        });
    }
    await Answer.destroy({where: { answer_id: req.params.answer_id}})
    sdc.timing('timer.answer.db.delete', Date.now() - startDb)
    logger.info('Answer deleted successfully')
    sdc.timing('timer.answer.http.delete', Date.now() - startApi)
    return res.status(204).send()

}

exports.attachFile = async (req, res) =>{
    logger.info("POST a file to answer api call.....")
    sdc.increment('endpoint.answer.file.http.post')
    let startApi = Date.now()
    const credentials = auth(req);
    if (!credentials || !await check(credentials.name, credentials.pass)) {
        logger.error('Access denied')
        sdc.timing('timer.answer.file.http.post.error', Date.now() - startApi)
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
        return;
    }
    let question = await Question.findByPk(req.params.question_id)
    if(!question) {
        logger.error('Question not found')
        sdc.timing('timer.answer.file.http.post.error', Date.now() - startApi)
        return res.status(404).send({Error: "Question Not found"})
    }

    let user = await User.findOne({where: {username: credentials.name}});

    let answer = await question.getAnswers({ where: {answer_id: req.params.answer_id}});
    if(answer.length === 0) {
        logger.error('Answer not found for given question')
        sdc.timing('timer.answer.file.http.post.error', Date.now() - startApi)
        return res.status(404).send({Error: "Answer not found for given question"})
    }

    answer = answer[0];
    if(answer.user_id !== user.id) {
        logger.error('User unauthorised')
        sdc.timing('timer.answer.file.http.post.error', Date.now() - startApi)
        return res.status(401).send({Error: "User unauthorised"})
    }

    const fileID = uuidv4();

    const upload = multer({
        storage: multerS3({
            s3: s3,
            bucket: process.env.BUCKET_NAME,
            key: function (req, file, cb) {
                cb(null, req.params.answer_id + "/" + fileID + "/" + path.basename( file.originalname, path.extname( file.originalname ) ) + path.extname( file.originalname ) )
            }
        }),
        limits:{ fileSize: 2000000 }, // In bytes: 2000000 bytes = 2 MB
        fileFilter: function( req, file, cb ){
            checkFileType( file, cb );
        }
    })

    let startS3 = Date.now()
    const singleUpload = upload.single('image');
    await singleUpload(req, res, async (err) => {
        if(err) {
            logger.error("Uploaded file was not an image for answer!!")
            sdc.timing('timer.answer.file.http.post.error', Date.now() - startApi)
            return res.status(400).send({Error: 'Images only!'});
        }
        if(!req.file) {
            logger.error("No file uploaded for answer!!")
            sdc.timing('timer.answer.file.http.post.error', Date.now() - startApi)
            return res.status(400).send({Error: 'No File Uploaded'})
        }
        logger.info("File for answer uploaded to S3")
        sdc.timing('timer.answer.file.S3.post', Date.now() - startS3)

        // console.log(req.file);
        const fileToAttach = {
            file_name: req.file.originalname,
            file_id: fileID,
            s3_object_name: req.file.key
        }
        let params = {
            Bucket: process.env.BUCKET_NAME,
            Key: fileToAttach.s3_object_name
        }
        const startMetadata = Date.now()
        const metadata = await s3.headObject(params).promise();
        sdc.timing('timer.answer.file.S3.metadata.get', Date.now() - startMetadata)

        console.log(metadata);

        fileToAttach.LastModified = metadata.LastModified.toLocaleString()
        fileToAttach.ContentLength = metadata.ContentLength.valueOf()
        fileToAttach.ETag = metadata.ETag.valueOf()

        let startDb = Date.now()
        const file = await File.create(fileToAttach);
        await answer.addAttachment(file);
        sdc.timing('timer.answer.file.db.create', Date.now() - startDb)
        logger.info("File attached successfully to answer in database")
        sdc.timing('timer.answer.file.http.post', Date.now() - startApi)
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
    logger.info("DELETE a file to answer api call.....")
    sdc.increment('endpoint.answer.file.http.delete')
    const startApi = Date.now()
    const credentials = auth(req);

    if (!credentials || !await check(credentials.name, credentials.pass)) {
        logger.error("Access denied")
        sdc.timing('timer.answer.file.http.delete.error', Date.now() - startApi)
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
        return;
    }

    let startDb = Date.now()
    const question = await Question.findByPk(req.params.question_id)
    sdc.timing('timer.question.db.findByPk', Date.now() - startDb)

    if(!question) {
        logger.error("Question not found!!")
        sdc.timing('timer.answer.file.http.delete.error', Date.now() - startApi)
        return res.status(404).send({Error: "Question Not found"})
    }

    let user = await User.findOne({where: {username: credentials.name}});
    let answer = await question.getAnswers({ where: {answer_id: req.params.answer_id}});
    if(answer.length === 0) {
        logger.error('Answer not found for given question')
        sdc.timing('timer.answer.file.http.delete.error', Date.now() - startApi)
        return res.status(404).send({Error: "Answer not found for given question"})
    }

    answer = answer[0];
    if(answer.user_id !== user.id) {
        logger.error("User unauthorized!")
        sdc.timing('timer.answer.file.http.delete.error', Date.now() - startApi)
        return res.status(401).send({Error: "User unauthorized"})
    }

    startDb = Date.now()
    let file = await answer.getAttachments({ where: {file_id: req.params.file_id}})
    if(file.length === 0) {
        logger.error("File not found for given answer")
        sdc.timing('timer.answer.file.http.delete.error', Date.now() - startApi)
        return res.status(404).send({Error: "File not found for given question"})
    }

    file = file[0];

    await answer.removeAttachment(file);

    await File.destroy({where: {file_id: req.params.file_id}})
    sdc.timing('timer.answer.file.db.delete', Date.now() - startDb)
    logger.info("File for answer destroyed from database!")

    let params = {
        Bucket: process.env.BUCKET_NAME,
        Key: file.s3_object_name
    }
    const startS3 = Date.now()
    s3.deleteObject(params, function(err, data) {
        if (err) {
            logger.error("Could not delete from S3 due to AWS Error")
            sdc.timing('timer.answer.file.http.delete.error', Date.now() - startApi)
            console.log(err, err.stack);
        } // error
        else {
            sdc.timing('timer.answer.file.S3.delete', Date.now() - startS3)
            logger.info("File for answer deleted from S3")
            sdc.timing('timer.answer.file.http.delete', Date.now() - startApi)
            return res.status(204).send();
        }   // deleted
    });

}




