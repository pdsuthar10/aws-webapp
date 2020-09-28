module.exports = (sequelize, Sequelize) => {
    const User = sequelize.define("user", {
        id: {
          type: Sequelize.UUID,
          primaryKey: true,
          allowNull: false
        },
        first_name: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        last_name: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        password: {
            type: Sequelize.STRING,
            allowNull: false,
        },
        email_address: {
            type: Sequelize.STRING,
            allowNull: false,
            unique: true,
            isEmail: true
        },

    },{
        timestamps: true,
        createdAt: 'account_created',
        updatedAt: 'account_updated'
    });
    return User;
};