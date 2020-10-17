module.exports = (sequelize, Sequelize) => {

    const File = sequelize.define("file",{
        file_name : {
            type: Sequelize.STRING,
            allowNull: false
        },
        s3_object_name: {
            type: Sequelize.STRING,
            allowNull: false
        },
        file_id : {
            type: Sequelize.UUID,
            primaryKey: true
        }
    }, {
        timestamps: true,
        createdAt: "created_date",
        updatedAt: false
    });

    return File

}