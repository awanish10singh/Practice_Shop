const fs = require("fs");
const path = require("path");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const PDFDocument = require("pdfkit");

const Product = require("../models/product");
const Order = require("../models/order");
const User = require("../models/user");

const ITEMS_PER_PAGE = process.env.ITEMS_PER_PAGE;

exports.getProducts = (req, res, next) => {
    const page = +req.query.page || 1;
    let totalItems;

    Product.find()
        .countDocuments()
        .then((numProducts) => {
            totalItems = numProducts;
            return Product.find()
                .skip((page - 1) * ITEMS_PER_PAGE)
                .limit(ITEMS_PER_PAGE);
        })
        .then((products) => {
            res.render("shop/product-list", {
                prods: products,
                pageTitle: "Products",
                path: "/products",
                currentPage: page,
                hasNextPage: ITEMS_PER_PAGE * page < totalItems,
                hasPreviousPage: page > 1,
                nextPage: page + 1,
                previousPage: page - 1,
                lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE),
            });
        })
        .catch((err) => {
            const error = new Error(err);
            error.httpStatusCode = 500;
            return next(error);
        });
};

exports.getProduct = (req, res, next) => {
    const prodId = req.params.productId;
    Product.findById(prodId)
        .then((product) => {
            res.render("shop/product-detail", {
                product: product,
                pageTitle: product.title,
                path: "/products",
            });
        })
        .catch((err) => {
            const error = new Error(err);
            error.httpStatusCode = 500;
            return next(error);
        });
};

exports.getIndex = (req, res, next) => {
    const page = +req.query.page || 1;
    let totalItems;

    Product.find()
        .countDocuments()
        .then((numProducts) => {
            totalItems = numProducts;
            return Product.find()
                .skip((page - 1) * ITEMS_PER_PAGE)
                .limit(ITEMS_PER_PAGE);
        })
        .then((products) => {
            res.render("shop/index", {
                prods: products,
                pageTitle: "Shop",
                path: "/",
                currentPage: page,
                hasNextPage: ITEMS_PER_PAGE * page < totalItems,
                hasPreviousPage: page > 1,
                nextPage: page + 1,
                previousPage: page - 1,
                lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE),
            });
        })
        .catch((err) => {
            const error = new Error(err);
            error.httpStatusCode = 500;
            return next(error);
        });
};

exports.getCart = (req, res, next) => {
    req.user
        .populate("cart.items.productId")

        .then((user) => {
            const products = user.cart.items;
            res.render("shop/cart", {
                path: "/cart",
                pageTitle: "Your Cart",
                products: products,
            });
        })
        .catch((err) => {
            const error = new Error(err);
            error.httpStatusCode = 500;
            return next(error);
        });
};

exports.postCart = (req, res, next) => {
    const prodId = req.body.productId;
    Product.findById(prodId)
        .then((product) => {
            return req.user.addToCart(product);
        })
        .then((result) => {
            // console.log(result);
            res.redirect("/cart");
        })
        .catch((err) => {
            const error = new Error(err);
            error.httpStatusCode = 500;
            return next(error);
        });
};

exports.postCartDeleteProduct = (req, res, next) => {
    const prodId = req.body.productId;
    req.user
        .removeFromCart(prodId)
        .then((result) => {
            res.redirect("/cart");
        })
        .catch((err) => {
            const error = new Error(err);
            error.httpStatusCode = 500;
            return next(error);
        });
};

exports.getCheckout = (req, res, next) => {
    let products;
    let total = 0;
    req.user
        .populate("cart.items.productId")

        .then((user) => {
            products = user.cart.items;
            total = 0;
            products.forEach((p) => {
                total += p.quantity * p.productId.price;
            });

            return stripe.checkout.sessions.create({
                payment_method_types: ["card"],
                line_items: products.map((p) => {
                    return {
                        price_data: {
                            currency: "inr",
                            product_data: {
                                name: p.productId.title,
                                description: p.productId.description,
                            },
                            unit_amount: Math.round(p.productId.price * 100), // Stripe expects paise
                        },
                        quantity: p.quantity,
                    };
                }),
                mode: "payment",
                billing_address_collection: "required",
                customer_email: req.user.email,
                metadata: {
                    userId: req.user._id.toString(), //  This is key
                },
                success_url: `${req.protocol}://${req.get(
                    "host"
                )}/checkout/success`,
                cancel_url: `${req.protocol}://${req.get(
                    "host"
                )}/checkout/cancel`,
            });
        })
        .then((session) => {
            // console.log(session);
            res.render("shop/checkout", {
                path: "/checkout",
                pageTitle: "Checkout",
                products: products,
                totalSum: total,
                sessionId: session.id,
                nonce: res.locals.nonce,
                stripePublicKey: process.env.STRIPE_PUBLISHABLE_KEY,
            });
        })
        .catch((err) => {
            console.log(err);
            const error = new Error(err);
            error.httpStatusCode = 500;
            return next(error);
        });
};

exports.stripeWebhookHandler = (req, res, next) => {
    const sig = req.headers["stripe-signature"];

    let event;
    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error(
            "⚠️  Webhook signature verification failed.",
            err.message
        );
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const userId = session.metadata.userId;
        const address = session.customer_details?.address;
        const email = session.customer_details?.email;

        // Fetch user & convert cart to order
        User.findById(userId)
            .populate("cart.items.productId")
            .then((user) => {
                if (!user) throw new Error("User not found");

                const products = user.cart.items.map((item) => ({
                    product: { ...item.productId._doc },
                    quantity: item.quantity,
                }));

                // console.log(products);

                const order = new Order({
                    user: {
                        email: email,
                        userId: userId,
                        address: {
                            line1: address.line1,
                            line2: address.line2,
                            city: address.city,
                            state: address.state,
                            postal_code: address.postal_code,
                            country: address.country,
                        },
                    },
                    products: products,
                });

                return order.save().then(() => {
                    user.cart = { items: [] };
                    return user.save();
                });
            })
            .then(() => {
                res.status(200).json({ received: true });
            })
            .catch((err) => {
                console.error("❌ Webhook processing failed:", err);
                res.status(500).json({ error: "Failed to create order" });
            });
    } else {
        res.status(200).json({ received: true });
    }
};

exports.getCheckoutSuccess = (req, res, next) => {
    req.user
        .clearCart()

        .then(() => {
            res.redirect("/orders");
        })
        .catch((err) => {
            const error = new Error(err);
            error.httpStatusCode = 500;
            return next(error);
        });
};

exports.postOrder = (req, res, next) => {
    req.user
        .populate("cart.items.productId")

        .then((user) => {
            const products = user.cart.items.map((i) => {
                return {
                    quantity: i.quantity,
                    product: { ...i.productId._doc },
                };
            });
            const order = new Order({
                user: {
                    email: req.user.email,
                    userId: req.user,
                },
                products: products,
            });
            return order.save();
        })
        .then((result) => {
            return req.user.clearCart();
        })
        .then(() => {
            res.redirect("/orders");
        })
        .catch((err) => {
            const error = new Error(err);
            error.httpStatusCode = 500;
            return next(error);
        });
};

exports.getOrders = (req, res, next) => {
    Order.find({ "user.userId": req.user._id })
        .then((orders) => {
            res.render("shop/orders", {
                path: "/orders",
                pageTitle: "Your Orders",
                orders: orders,
            });
        })
        .catch((err) => {
            const error = new Error(err);
            error.httpStatusCode = 500;
            return next(error);
        });
};

exports.getInvoice = (req, res, next) => {
    const orderId = req.params.orderId;

    Order.findById(orderId)
        .then((order) => {
            if (!order) {
                return next(new Error("No order found."));
            }
            if (order.user.userId.toString() !== req.user._id.toString()) {
                return next(new Error("Unauthorized"));
            }

            const invoiceName = `invoice-${orderId}.pdf`;
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader(
                "Content-Disposition",
                `inline; filename="${invoiceName}"`
            );

            const pdfDoc = new PDFDocument({ margin: 50 });
            pdfDoc.pipe(res);

            // Logo
            const logoPath = path.join("public", "images", "shop-logo.png");
            if (fs.existsSync(logoPath)) {
                pdfDoc.image(logoPath, 50, 45, { width: 80 });
            }
            pdfDoc.fontSize(20).text("Practice Shop", 140, 50);
            pdfDoc
                .fontSize(10)
                .text("123 MG Road, New Delhi, Delhi - 110001", 140, 70);
            pdfDoc.text("Email: support@practiceshop.in", 140, 85);
            pdfDoc.text("GSTIN: 07ABCDE1234F1Z5", 140, 100);
            pdfDoc.moveDown(2);

            // Invoice Meta
            pdfDoc.fontSize(14).text(`Invoice #${orderId}`);
            pdfDoc.text(`Date: ${new Date().toLocaleDateString("en-IN")}`);
            pdfDoc.text(`Customer: ${req.user.email}`);
            pdfDoc.moveDown();

            // Table Header
            pdfDoc.fontSize(12).font("Helvetica-Bold");
            pdfDoc.text("Product ID", 50);
            pdfDoc.text("Title", 150);
            pdfDoc.text("Qty", 320);
            pdfDoc.text("Price", 370);
            pdfDoc.text("Total", 450);
            pdfDoc.moveDown(0.3);
            pdfDoc.font("Helvetica");

            let subtotal = 0;

            order.products.forEach((prod) => {
                const title = prod.product.title;
                const id = prod.product._id.toString();
                const qty = prod.quantity;
                const price = prod.product.price;
                const total = qty * price;
                subtotal += total;

                const y = pdfDoc.y;

                pdfDoc.text(id, 50, y, { width: 90 });
                pdfDoc.text(title, 150, y, { width: 150 });
                pdfDoc.text(qty.toString(), 320, y);
                pdfDoc.text(`₹${price.toFixed(2)}`, 370, y);
                pdfDoc.text(`₹${total.toFixed(2)}`, 450, y);

                const titleHeight = pdfDoc.heightOfString(title, {
                    width: 150,
                });
                pdfDoc.moveDown(titleHeight / 14);
            });

            // Totals Section
            const gstRate = 0.18;
            const gst = subtotal * gstRate;
            const grandTotal = subtotal + gst;

            pdfDoc.moveDown(1);
            pdfDoc.font("Helvetica-Bold");
            pdfDoc.text(`Subtotal: ₹${subtotal.toFixed(2)}`, {
                align: "right",
            });
            pdfDoc.text(`GST (18%): ₹${gst.toFixed(2)}`, { align: "right" });
            pdfDoc.text(`Total: ₹${grandTotal.toFixed(2)}`, { align: "right" });

            // Footer
            pdfDoc.moveDown(2);
            pdfDoc.fontSize(10).font("Helvetica");
            pdfDoc.text("Thank you for shopping with us!", { align: "center" });
            pdfDoc.text("This is a system-generated invoice.", {
                align: "center",
            });

            pdfDoc.end();
        })
        .catch((err) => next(err));
};
