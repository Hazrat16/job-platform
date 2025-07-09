import dotenv from "dotenv";
import { Resend } from "resend";
dotenv.config(); // ensure .env is loaded if it wasn't already

// import dotenv from "dotenv";
// import nodemailer from "nodemailer";

// dotenv.config();

// export const sendVerificationEmail = async (to: string, token: string) => {
//   try {
//     const transporter = nodemailer.createTransport({
//       host: "smtp-relay.brevo.com",
//       port: 587,
//       secure: false,
//       auth: {
//         user: process.env.BREVO_USER,
//         pass: process.env.BREVO_PASS,
//       },
//     });

//     await transporter.verify();
//     console.log("✅ SMTP connection verified");

//     const info = await transporter.sendMail({
//       from: `"Job Platform" <${process.env.BREVO_USER}>`,
//       to: "hazrat17016@gmail.com",
//       subject: "Verify your email",
//       html: `<p>Click <a href="http://localhost:5000/api/auth/verify-email?token=${token}">here</a> to verify your email.</p>`,
//     });

//     console.log("✅ Email sent:", info.messageId);
//     return true;
//   } catch (err) {
//     console.error("❌ Email send error:", err);
//     return false;
//   }
// };

dotenv.config(); // ensure .env is loaded if it wasn't already

const resend = new Resend(process.env.RESEND_API_KEY); // ✅ pass key directly

export const sendVerificationEmail = async (to: string, token: string) => {
  const link = `http://localhost:5000/api/auth/verify-email?token=${token}`;
  try {
    const { data, error } = await resend.emails.send({
      from: "Job Platform <onboarding@resend.dev>",
      to,
      subject: "Verify your email",
      html: `<p>Please verify your email by clicking <a href="${link}">this link</a></p>`,
    });

    if (error) {
      console.error("Error sending email:", error);
      return false;
    }

    console.log("Verification email sent", data);
    return true;
  } catch (err) {
    console.error("Failed to send email", err);
    return false;
  }
};
