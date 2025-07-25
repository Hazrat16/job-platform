import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user:  process.env.BREVO_USER,
    pass:  process.env.BREVO_PASS,
  },
});

transporter.verify(function (error, success) {
  if (error) {
    console.error(" Not logged in: ", error.message);
  } else {
    console.log("Logged in and ready to send emails");
  }
});
