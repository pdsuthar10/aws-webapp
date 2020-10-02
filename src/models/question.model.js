module.exports = (sequelize, Sequelize) => {

    const Question = sequelize.define("question",{
        question_id : {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false
        },
        question_text: {
            type: Sequelize.STRING,
            allowNull: false
        }
    }, {
        timestamps: true,
        createdAt: "created_timestamp",
        updatedAt: "updated_timestamp"
    });


    return Question

}