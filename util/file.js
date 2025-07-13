const fs = require("fs");

const deleteFile = (filePath) => {
    fs.unlink(filePath, (err) => {
        if (err) {
            const error = new Error(err);
            error.httpStatusCode = 500;

            console.log(error);
        }
    });
};

exports.deleteFile = deleteFile;
