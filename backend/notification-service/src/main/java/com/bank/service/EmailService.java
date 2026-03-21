package com.bank.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender;

    @Value("${mail.from:noreply@bank.com}")
    private String fromEmail;

    public void sendTransferSentEmail(String to, String reference, String amount, String currency) {
        String subject = "Transfer Sent - " + reference;
        String body = buildEmailTemplate(
            "Transfer Sent Successfully",
            "Your transfer has been processed.",
            "Reference: <strong>" + reference + "</strong><br>" +
            "Amount: <strong>" + currency + " " + amount + "</strong>",
            "Thank you for using CloudBank."
        );
        send(to, subject, body);
    }

    public void sendTransferReceivedEmail(String to, String reference, String amount, String currency) {
        String subject = "Funds Received - " + reference;
        String body = buildEmailTemplate(
            "Funds Received",
            "You have received a transfer.",
            "Reference: <strong>" + reference + "</strong><br>" +
            "Amount: <strong>" + currency + " " + amount + "</strong>",
            "The funds are now available in your account."
        );
        send(to, subject, body);
    }

    public void sendDepositEmail(String to, String amount, String currency) {
        String subject = "Deposit Confirmed";
        String body = buildEmailTemplate(
            "Deposit Confirmed",
            "Your deposit has been processed.",
            "Amount: <strong>" + currency + " " + amount + "</strong>",
            "The funds are now available in your account."
        );
        send(to, subject, body);
    }

    public void sendTransactionFailedEmail(String to, String reference, String reason) {
        String subject = "Transaction Failed - " + reference;
        String body = buildEmailTemplate(
            "Transaction Failed",
            "Unfortunately your transaction could not be processed.",
            "Reference: <strong>" + reference + "</strong><br>" +
            "Reason: <strong>" + reason + "</strong>",
            "No funds have been debited. Please try again."
        );
        send(to, subject, body);
    }

    public void sendWelcomeEmail(String to, String name) {
        String subject = "Welcome to CloudBank!";
        String body = buildEmailTemplate(
            "Welcome, " + name + "!",
            "Your CloudBank account is ready.",
            "You can now create accounts, transfer funds, and manage your finances securely.",
            "If you did not create this account, please contact support immediately."
        );
        send(to, subject, body);
    }

    public void sendGenericEmail(String to, String subject, String bodyText) {
        send(to, subject, "<p>" + bodyText + "</p>");
    }

    private void send(String to, String subject, String htmlBody) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromEmail);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);
            mailSender.send(message);
            log.info("Email sent to {} subject: {}", to, subject);
        } catch (MessagingException e) {
            log.error("Failed to send email to {}: {}", to, e.getMessage());
        }
    }

    private String buildEmailTemplate(String title, String subtitle, String content, String footer) {
        return """
            <html><body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
              <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden;">
                <div style="background: #1a56db; padding: 24px;">
                  <h1 style="color: white; margin: 0; font-size: 22px;">CloudBank</h1>
                </div>
                <div style="padding: 32px;">
                  <h2 style="color: #1a1a1a; margin-top: 0;">%s</h2>
                  <p style="color: #555; font-size: 16px;">%s</p>
                  <div style="background: #f8f9fa; border-radius: 6px; padding: 16px; margin: 24px 0; color: #333; font-size: 15px; line-height: 1.8;">
                    %s
                  </div>
                  <p style="color: #777; font-size: 14px;">%s</p>
                </div>
                <div style="background: #f4f4f4; padding: 16px; text-align: center; color: #999; font-size: 12px;">
                  CloudBank &copy; 2025 · University of Ruhuna · EC7205
                </div>
              </div>
            </body></html>
            """.formatted(title, subtitle, content, footer);
    }
}
