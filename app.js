const dotenv = require("dotenv");
dotenv.config();

const path = require("path");
// const fs = require("fs");
const crypto = require("crypto");

const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoDBStore = require("connect-mongodb-session")(session);
const flash = require("connect-flash");
const multer = require("multer");
const helmet = require("helmet");
const compression = require("compression");
// const morgan = require("morgan");

const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

cloudinary.config(); // Automatically reads from process.env.CLOUDINARY_URL

const errorController = require("./controllers/error");
const User = require("./models/user");

const app = express();

const store = new MongoDBStore({
    uri: process.env.MONGODB_URI,
    collection: "sessions",
});
// const csrfProtection = csrf();

// const fileStorage = multer.diskStorage({
//     destination: (req, file, cb) => {
//         cb(null, "images");
//     },
//     filename: (req, file, cb) => {
//         const timestamp = new Date().toISOString().replace(/:/g, "-");
//         cb(null, timestamp + "-" + file.originalname);
//     },
// });

const cloudStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "product-images", // Optional: organizes your uploads
        allowed_formats: ["jpg", "jpeg", "png"],
    },
});

const fileFilter = (req, file, cb) => {
    if (
        file.mimetype === "image/png" ||
        file.mimetype === "image/jpg" ||
        file.mimetype === "image/jpeg"
    ) {
        cb(null, true);
    } else {
        cb(null, false);
    }
};

app.set("view engine", "ejs");
app.set("views", "views");

const adminRoutes = require("./routes/admin");
const shopRoutes = require("./routes/shop");
const authRoutes = require("./routes/auth");

app.use((req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString("base64");
    next();
});

app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "https://js.stripe.com",
                (req, res) => `'nonce-${res.locals.nonce}'`,
            ],
            frameSrc: ["'self'", "https://js.stripe.com"],
            connectSrc: [
                "'self'",
                "https://js.stripe.com",
                "https://api.stripe.com",
            ],
            imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
        },
    })
);

// const accessLogStream = fs.createWriteStream(
//     path.join(__dirname, "access.log"),
//     { flags: "a" }
// );

app.use(compression());
// app.use(morgan("combined", { stream: accessLogStream }));

app.use(bodyParser.urlencoded({ extended: false }));
// app.use(multer({ storage: fileStorage, fileFilter: fileFilter }).single("image"));
app.use(
    multer({ storage: cloudStorage, fileFilter: fileFilter }).single("image")
);

app.use(express.static(path.join(__dirname, "public")));
// app.use("/images", express.static(path.join(__dirname, "images")));  //no longer serving images from disk

app.use(
    session({
        secret: process.env.SESSION_SECRET_KEY,
        resave: false,
        saveUninitialized: false,
        store: store,
    })
);
app.use(flash());

app.use((req, res, next) => {
    res.locals.isAuthenticated = req.session.isLoggedIn;
    // res.locals.csrfToken = req.csrfToken();
    next();
});

app.use((req, res, next) => {
    // throw new Error('Sync Dummy');
    if (!req.session.user) {
        return next();
    }
    User.findById(req.session.user._id)
        .then((user) => {
            if (!user) {
                return next();
            }
            req.user = user;
            next();
        })
        .catch((err) => {
            next(new Error(err));
        });
});

app.use("/admin", adminRoutes);
app.use(shopRoutes);
app.use(authRoutes);

// app.get("/500", errorController.get500);

app.use(errorController.get404);

app.use((error, req, res, next) => {
    // res.status(error.httpStatusCode).render(...);
    // res.redirect('/500');

    console.log(error);
    res.status(500).render("500", {
        pageTitle: "Error!",
        path: "/500",
        isAuthenticated: req.session?.isLoggedIn,
        error: error,
    });
});

mongoose
    .connect(process.env.MONGODB_URI)
    .then((result) => {
        console.log("DB Connected.");
        app.listen(3000, () => {
            console.log("Server running on port 3000.");
        });
    })
    .catch((err) => {
        console.log(err);
    });
