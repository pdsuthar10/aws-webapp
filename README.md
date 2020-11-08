# CSYE 6225 - Fall 2020
A Node.js web app that runs different REST API endpoints on backend to create, authenticate, get and update user information using MySQL as database

## Technology Stack
* Backend Technology: Node JS
* Framework: Express
* Database: MySQL
* Testing Framework: Jest

## Build Instructions
* Clone repo using command "git clone git@github.com:sutharp-fall2020-csye6225/webapp.git"
* Navigate to webapp directory in webapp folder using "cd webapp" command
* Run "npm install" command on terminal.
```shell script
npm install
```

## Deploy Instructions
* Start SQL server on your machine and create an empty schema named "devdb" using MySQL
* Create a file .env in src folder and it should have the following fields:
  ```Javascript
  {
    HOST=localhost
    username=root
    PASSWORD=[your_password]
    DB=devdb
   }
  ```
* Environment variables can also be set through command line using export command
* Run "npm run dev" command on terminal.
```shell script
npm run dev
```
* Use Postman or any other endpoint application to test the API endpoints
* Swagger documentation for APIs: https://app.swaggerhub.com/apis-docs/csye6225/fall2020-csye6225/assignment-03#/

## Running Tests
* Run "npm run test" on webapp directory
```shell script
npm run test
```


