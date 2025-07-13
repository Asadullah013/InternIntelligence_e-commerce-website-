require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

async function start() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db();
    const users = db.collection('users');
    const products = db.collection('products');
    const carts = db.collection('carts');
    const orders = db.collection('orders');

    // Signup
    app.post('/signup', async (req, res) => {
      const { name, email, phone, address, password, role } = req.body;
      const existingUser = await users.findOne({ email });
      if (existingUser) return res.status(400).json({ message: 'User already exists' });
      const hashedPassword = await bcrypt.hash(password, 10);
      await users.insertOne({ name, email, phone, address, password: hashedPassword, role });
      res.status(201).json({ message: 'Signup successful' });
    });

    // Login
    app.post('/login', async (req, res) => {
      const { email, password } = req.body;
      const user = await users.findOne({ email });
      if (!user) return res.status(404).json({ message: 'User not found' });
      const isPasswordCorrect = await bcrypt.compare(password, user.password);
      if (!isPasswordCorrect) return res.status(401).json({ message: 'Invalid password' });
      const token = jwt.sign({ email: user.email, role: user.role }, 'secretKey123', { expiresIn: '1h' });
     res.json({
  message: 'Login successful',
  token,
  role: user.role,
  name: user.name,
  email: user.email,
  phone: user.phone,
  address: user.address
});

    });

    // Add product (seller only)
    app.post('/add-product', async (req, res) => {
      const { token, name, description, price, image } = req.body;
      try {
        const decoded = jwt.verify(token, 'secretKey123');
        if (decoded.role !== 'seller') return res.status(403).json({ message: 'Access denied' });
        await products.insertOne({ name, description, price, image, sellerEmail: decoded.email });
        res.status(201).json({ message: 'Product added successfully' });
      } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
      }
    });

    // Seller products
    app.post('/my-products', async (req, res) => {
      const { token } = req.body;
      try {
        const decoded = jwt.verify(token, 'secretKey123');
        if (decoded.role !== 'seller') return res.status(403).json({ message: 'Access denied' });
        const sellerProducts = await products.find({ sellerEmail: decoded.email }).toArray();
        res.json(sellerProducts);
      } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
      }
    });

    // All products (for customers)
    app.get('/products', async (req, res) => {
      const allProducts = await products.find().toArray();
      res.json(allProducts);
    });

    // Add to cart
    app.post('/add-to-cart', async (req, res) => {
      const { token, productId } = req.body;
      try {
        const decoded = jwt.verify(token, 'secretKey123');
        if (decoded.role !== 'customer') return res.status(403).json({ message: 'Access denied' });
       await carts.insertOne({ customerEmail: decoded.email, productId: new ObjectId(productId) });

        res.json({ message: 'Added to cart' });
      } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
      }
    });

    // View cart
    app.post('/cart', async (req, res) => {
      const { token } = req.body;
      try {
        const decoded = jwt.verify(token, 'secretKey123');
        const cartItems = await carts.find({ customerEmail: decoded.email }).toArray();
       const productIds = cartItems.map(item => item.productId);
        const productsInCart = await products.find({ _id: { $in: productIds } }).toArray();
        res.json(productsInCart);
      } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
      }
    });

    // Buy product
    // Buy product
app.post('/buy-product', async (req, res) => {
  const { token, productId } = req.body;
  try {
    const decoded = jwt.verify(token, 'secretKey123');
    const customerEmail = decoded.email;

    const product = await products.findOne({ _id: new ObjectId(productId) });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    await orders.insertOne({
      productId,
      productName: product.name,
      productPrice: product.price,
      productImage: product.image,                 // ✅ add this
      productDescription: product.description || '', // ✅ add this
      sellerEmail: product.sellerEmail,
      customerEmail,
      purchasedAt: new Date(),
    });

    res.json({ message: 'Purchase successful' });
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
});


    // Customer purchases
    app.post('/my-purchases', async (req, res) => {
      const { token } = req.body;
      try {
        const decoded = jwt.verify(token, 'secretKey123');
        const purchases = await orders.find({ customerEmail: decoded.email }).toArray();
        res.json(purchases);
      } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
      }
    });

    // Seller orders
    app.post('/my-orders', async (req, res) => {
      const { token } = req.body;
      try {
        const decoded = jwt.verify(token, 'secretKey123');
        const ordersList = await orders.find({ sellerEmail: decoded.email }).toArray();
        res.json(ordersList);
      } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
      }
    });
    app.post('/remove-from-cart', async (req, res) => {
  const { token, productId } = req.body;

  try {
    const decoded = jwt.verify(token, 'secretKey123');
    const customerEmail = decoded.email;

    const result = await carts.deleteOne({
      customerEmail,
      productId: new ObjectId(productId), // Convert to ObjectId here too
    });

    if (result.deletedCount === 1) {
      res.json({ message: 'Removed from cart' });
    } else {
      res.status(404).json({ message: 'Item not found in cart' });
    }
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

app.post('/delete-product', async (req, res) => {
  const { token, productId } = req.body;

  try {
    const decoded = jwt.verify(token, 'secretKey123');
    if (decoded.role !== 'seller') {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const result = await products.deleteOne({
      _id: new ObjectId(productId),
      sellerEmail: decoded.email
    });

    if (result.deletedCount === 1) {
      res.json({ message: 'Product deleted successfully' });
    } else {
      res.status(404).json({ message: 'Product not found or not yours' });
    }

  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

 
app.use(express.static(path.join(__dirname))); // serve HTML, CSS, JS files

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to connect to MongoDB', error);
  }

  
}

start();

