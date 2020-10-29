const db = require("../models");
const Question = db.questions;
const User = db.users;
const Category = db.categories;
const Answer = db.answers;
const File = db.files;
const auth = require('basic-auth')
const { v4: uuidv4 } = require('uuid');
const joi = require('joi');
const bcrypt = require('bcrypt');
const multer = require('multer');
const multerS3 = require('multer-s3');
const aws = require('aws-sdk');
const s3 = new aws.S3();
const path = require('path');
require('dotenv').config();



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
    } else {

        const arraySchema = joi.array().items(
            joi.object({
                category: joi.string()
            })
        );
        const schema = joi.object().keys({
            question_text: joi.string().required(),
            categories: arraySchema
        });

        let validation = schema.validate(req.body);
        if(validation.error) return res.status(400).send({Error: validation.error.details[0].message});

        let user = await User.findOne({where: {username: credentials.name}});

        let question = {
            question_id: uuidv4(),
            question_text: req.body.question_text,
        }
        let questionCreated = await Question.create(question)
        if(!questionCreated) return res.status(500).send({Error: "Internal Error"});

        await user.addQuestion(questionCreated)

        if(req.body.categories){
            let i = 0
            for(;i<req.body.categories.length;i++){
                let questionCategory = req.body.categories[i]
                let [categoryToAdd, created] = await Category.findOrCreate({where: {category: questionCategory.category.toLowerCase()},
                    defaults: {
                        category_id: uuidv4()
                    }
                })
                await questionCreated.addCategory(categoryToAdd)
            }
        }

        const result = await Question.findByPk(questionCreated.question_id,{
            include: [
                {
                    model: Category,
                    through: { attributes: [] }
                },
                {
                    as: 'answers',
                    model: Answer
                },
                {
                    as: 'attachments',
                    model: File,
                    attributes: ['file_name','s3_object_name','file_id','created_date', 'LastModified', 'ContentLength', 'ETag']
                }]
        })

        return res.status(201).send(result);
    }
}

exports.getAllQuestions = async (req,res) => {
    const result = await Question.findAll({
        include: [
            {
                model: Category,
                through: { attributes: [] }
            },
            {
                as: 'answers',
                model: Answer,
                include : {
                    as: 'attachments',
                    model: File,
                    attributes: ['file_name','s3_object_name','file_id','created_date', 'LastModified', 'ContentLength', 'ETag']
                }
            },
            {
                as: 'attachments',
                model: File,
                attributes: ['file_name','s3_object_name','file_id','created_date', 'LastModified', 'ContentLength', 'ETag']
            }
        ]
    })

    res.status(200).send(result)
}

exports.getQuestion = async (req,res) => {
    const result = await Question.findByPk(req.params.question_id,{
        include: [
            {
                model: Category,
                through: { attributes: [] }
            },
            {
                as: 'answers',
                model: Answer,
                include : {
                    as: 'attachments',
                    model: File,
                    attributes: ['file_name','s3_object_name','file_id','created_date', 'LastModified', 'ContentLength', 'ETag']
                }
            },
            {
                as: 'attachments',
                model: File,
                attributes: ['file_name','s3_object_name','file_id','created_date', 'LastModified', 'ContentLength', 'ETag']
            }
            ]
    })

    if(!result) return res.status(404).send({Error: "Question not found"})

    res.status(200).send(result);
}

async function checkUserForQuestion(username, user_id){
    const user = await User.findOne({where: {username: username}});
    if(user.id === user_id)
        return true;

    return false;

}

exports.deleteQuestion = async (req,res) => {
    const credentials = auth(req);
    if (!credentials || !await check(credentials.name, credentials.pass)) {
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.send({Error: "Access denied"})
        return;
    }


    let question = await Question.findByPk(req.params.question_id)
    if(!question) return res.status(404).send({Error: "Question not found"})

    let user = await checkUserForQuestion(credentials.name, question.user_id)

    if(!user) return res.status(401).send({Error: "User unauthorized"})

    user = await User.findOne({where: {username: credentials.name}});
    let answers = await question.getAnswers();
    if(answers.length === 0){
        let files = await question.getAttachments();

        for(let i=0;i<files.length;i++){
            await File.destroy({where: {file_id: files[i].file_id}})

            let params = {
                Bucket: process.env.BUCKET_NAME,
                Key: files[i].s3_object_name
            }
            s3.deleteObject(params, function(err, data) {
                if (err) console.log(err, err.stack);  // error
                else    return;   // deleted
            });
        }
        let result = await Question.destroy({ where: {question_id: question.question_id}})
        if(!result) return res.status(500).send({Error: 'Internal error'})
        return res.status(204).send({"Message": "Successfully deleted"})
    }
    return res.status(400).send({Error: "The question has 1 or more answers."})

}

exports.updateQuestion = async (req, res) => {
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
    if(user.id !== question.user_id) return res.status(401).send({Error: "User unauthorized"})

    const arraySchema = joi.array().items(
        joi.object({
            category: joi.string()
        })
    );
    const schema = joi.object().keys({
        question_text: joi.string(),
        categories: arraySchema
    });

    const { question_text, categories } = req.body;

    if(!question_text && !categories) return res.status(400).send({Error: "No field supplied to update"})

    let validation = schema.validate(req.body);
    if(validation.error) return res.status(400).send({Error: validation.error.details[0].message});

    let updatedQuestion = {}

    if(question_text){
        updatedQuestion.question_text = question_text
    }

    await Question.update(updatedQuestion, { where: { question_id: req.params.question_id}})

    let questionUpdated = await Question.findByPk(req.params.question_id)

    if(categories){
        await questionUpdated.setCategories([]);
        let i = 0
        for(;i<categories.length;i++){
            let questionCategory = categories[i]
            let [categoryToAdd, created] = await Category.findOrCreate({where: {category: questionCategory.category.toLowerCase()},
                defaults: {
                    category_id: uuidv4()
                }
            })

            await questionUpdated.addCategory(categoryToAdd)
        }

    }
    res.status(204).send({});

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
    if(user.id !== question.user_id) return res.status(401).send({Error: "User unauthorized"})


    const fileID = uuidv4();

    const upload = multer({
        storage: multerS3({
            s3: s3,
            bucket: process.env.BUCKET_NAME,
            key: function (req, file, cb) {
                cb(null, req.params.question_id + "/" + fileID + "/" + path.basename( file.originalname, path.extname( file.originalname ) ) + path.extname( file.originalname ) )
            }
        }),
        limits:{ fileSize: 5000000 },
        fileFilter: function( req, file, cb ){
            checkFileType( file, cb );
        }
    })

    const singleUpload = upload.single('image');
    await singleUpload(req, res, async (err) => {
        if(err) return res.status(400).send({Error: 'Images only!'});
        if(!req.file) return res.status(400).send({Error: 'No File Uploaded'})

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
        const metadata = await s3.headObject(params).promise();

        fileToAttach.LastModified = metadata.LastModified.toLocaleString()
        fileToAttach.ContentLength = metadata.ContentLength.valueOf()
        fileToAttach.ETag = metadata.ETag.valueOf()

        const file = await File.create(fileToAttach);
        await question.addAttachment(file);

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
    if(user.id !== question.user_id) return res.status(401).send({Error: "User unauthorized"})

    let file = await question.getAttachments({ where: {file_id: req.params.file_id}})
    if(file.length === 0) return res.status(404).send({Error: "File not found for given question"})

    file = file[0];

    await question.removeAttachment(file);

    await File.destroy({where: {file_id: req.params.file_id}})

    let params = {
        Bucket: process.env.BUCKET_NAME,
        Key: file.s3_object_name
    }
    s3.deleteObject(params, function(err, data) {
        if (err) console.log(err, err.stack);  // error
        else    return res.status(204).send();   // deleted
    });

}
