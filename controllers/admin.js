const cloudinary = require("cloudinary").v2;

const { validationResult } = require("express-validator");

const Product = require("../models/product");

exports.getProducts = (req, res, next) => {
    Product.find({ userId: req.user._id })
        // .select('title price -_id')
        // .populate('userId', 'name')
        .then((products) => {
            // console.log(products);
            res.render("admin/products", {
                prods: products,
                pageTitle: "Admin Products",
                path: "/admin/products",
            });
        })
        .catch((err) => {
            const error = new Error(err);
            error.httpStatusCode = 500;
            return next(error);
        });
};

exports.getAddProduct = (req, res, next) => {
    res.render("admin/edit-product", {
        pageTitle: "Add Product",
        path: "/admin/add-product",
        editing: false,
        hasError: false,
        errorMessage: null,
        validationErrors: [],
    });
};

exports.postAddProduct = (req, res, next) => {
    const title = req.body.title;
    const image = req.file;
    const price = req.body.price;
    const description = req.body.description;

    if (!image) {
        return res.status(422).render("admin/edit-product", {
            pageTitle: "Add Product",
            path: "/admin/add-product",
            editing: false,
            hasError: true,
            product: {
                title,
                price,
                description,
            },
            errorMessage: "Attached file is not an image.",
            validationErrors: [],
        });
    }

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(422).render("admin/edit-product", {
            pageTitle: "Add Product",
            path: "/admin/add-product",
            editing: false,
            hasError: true,
            product: {
                title,
                price,
                description,
            },
            errorMessage: errors.array()[0].msg,
            validationErrors: errors.array(),
        });
    }

    // From multer-storage-cloudinary
    const imageUrl = image.path; // full Cloudinary URL
    const imagePublicId = image.filename; // public_id from Cloudinary
    console.log(imageUrl);

    const product = new Product({
        title,
        price,
        description,
        imageUrl,
        imagePublicId, // ✅ storing public_id for deletion support
        userId: req.user,
    });

    product
        .save()
        .then(() => {
            res.redirect("/admin/products");
        })
        .catch((err) => {
            const error = new Error(err);
            error.httpStatusCode = 500;
            return next(error);
        });
};

exports.getEditProduct = (req, res, next) => {
    const editMode = req.query.edit;
    if (!editMode) {
        return res.redirect("/");
    }
    const prodId = req.params.productId;
    Product.findById(prodId)
        .then((product) => {
            if (!product) {
                return res.redirect("/");
            }
            res.render("admin/edit-product", {
                pageTitle: "Edit Product",
                path: "/admin/edit-product",
                editing: editMode,
                product: product,
                hasError: false,
                errorMessage: null,
                validationErrors: [],
            });
        })
        .catch((err) => {
            const error = new Error(err);
            error.httpStatusCode = 500;
            return next(error);
        });
};

exports.postEditProduct = (req, res, next) => {
    const prodId = req.body.productId;
    const updatedTitle = req.body.title;
    const updatedPrice = req.body.price;
    const image = req.file;
    const updatedDesc = req.body.description;

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(422).render("admin/edit-product", {
            pageTitle: "Edit Product",
            path: "/admin/edit-product",
            editing: true,
            hasError: true,
            product: {
                title: updatedTitle,
                price: updatedPrice,
                description: updatedDesc,
                _id: prodId,
            },
            errorMessage: errors.array()[0].msg,
            validationErrors: errors.array(),
        });
    }

    Product.findById(prodId)
        .then((product) => {
            if (!product) {
                return res.redirect("/");
            }

            if (product.userId.toString() !== req.user._id.toString()) {
                return res.redirect("/");
            }

            product.title = updatedTitle;
            product.price = updatedPrice;
            product.description = updatedDesc;

            if (!image) {
                return product.save();
            }

            // 🔥 Delete old image from Cloudinary if image is updated
            return cloudinary.uploader
                .destroy(product.imagePublicId)
                .then(() => {
                    product.imageUrl = image.path;
                    product.imagePublicId = image.filename;
                    return product.save();
                })
                .catch((err) => {
                    console.error(
                        "Cloudinary image deletion failed:",
                        err.message
                    );
                    return product.save(); // still save product even if deletion fails
                });
        })
        .then(() => {
            res.redirect("/admin/products");
        })
        .catch((err) => {
            const error = new Error(err);
            error.httpStatusCode = 500;
            return next(error);
        });
};

exports.deleteProduct = (req, res, next) => {
    const prodId = req.params.productId;

    Product.findById(prodId)
        .then((product) => {
            if (!product) {
                return next(new Error("Product not found."));
            }

            // 🔥 Delete image from Cloudinary
            return cloudinary.uploader
                .destroy(product.imagePublicId)
                .then(() => {
                    return Product.deleteOne({
                        _id: prodId,
                        userId: req.user._id,
                    });
                });
        })
        .then(() => {
            res.status(200).json({ message: "Success!" });
        })
        .catch((err) => {
            console.error("Error deleting product or image:", err.message);
            res.status(500).json({ message: "Deleting product failed." });
        });
};
