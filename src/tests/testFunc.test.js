const request = require('supertest');
const app = require('../app');
const bcrypt = require('bcrypt');
const assert = require('assert');

describe('GET /checkAuthorization', () => {
    it("should authorize the user", async() => {
        let result = await request(app)
            .get('/v1/users/checkAuthorization')
            .set('Authorization', 'Basic '+new Buffer.from("test@test.com:Test@1234").toString("base64"))
            .expect(200)
        if(!result) return false;
    });

    it("should not authorize the user", async() => {
        let result = await request(app)
            .get('/v1/users/checkAuthorization')
            .set('Authorization', 'Basic '+new Buffer.from("test@test.com:Test@1234"))
            .expect(401)
        if(!result) return false;
    });
});

describe('POST /users', ()=>{
    it('should generate a hash of the password while creating user', async ()=>{
        let user = {
            first_name: "Test",
            last_name: "test",
            email_address: "test@test.com",
            password: "Hello@world1"
        }
        let result = await request(app)
            .post('/v1/users/generateHash')
            .send(user)
            .set('Accept','application/json')
            .expect(201)
            .then(res =>{
                assert(bcrypt.compare(user.password,res.body.password))
            })
    })

    it('should return an error because of the body structure', async ()=>{
        let result = await request(app)
            .post('/v1/users')
            .send({
                firstName: "hello"
            })
            .expect(400)
    })
})
