# How to Get Your JWT Token from Alpha.Date

## 🔍 **Step-by-Step Guide**

### **Method 1: Using Browser Developer Tools**

1. **Open Alpha.Date** in your browser
2. **Log in** to your Alpha.Date account
3. **Open Developer Tools**:
   - **Chrome/Edge**: Press `F12` or `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
   - **Firefox**: Press `F12` or `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
4. **Go to Network Tab** in Developer Tools
5. **Refresh the page** or navigate around Alpha.Date
6. **Look for API calls** to `alpha.date/api/`
7. **Find a request** that includes an `Authorization` header
8. **Copy the token** from the `Authorization: Bearer YOUR_TOKEN_HERE` header

### **Method 2: Using Application Tab**

1. **Open Alpha.Date** in your browser
2. **Log in** to your Alpha.Date account
3. **Open Developer Tools** (`F12`)
4. **Go to Application Tab** (Chrome) or **Storage Tab** (Firefox)
5. **Look for Local Storage** or **Session Storage**
6. **Find Alpha.Date domain** and look for token-related entries
7. **Copy the token** value

### **Method 3: Using Console**

1. **Open Alpha.Date** in your browser
2. **Log in** to your Alpha.Date account
3. **Open Developer Tools** (`F12`)
4. **Go to Console Tab**
5. **Type and run** this command:
   ```javascript
   // This will show all localStorage items
   Object.keys(localStorage).forEach(key => {
     if (key.toLowerCase().includes('token') || key.toLowerCase().includes('auth')) {
       console.log(key + ':', localStorage.getItem(key));
     }
   });
   ```
6. **Copy the token** from the output

## 🔧 **What the Token Looks Like**

A JWT token typically looks like this:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

## ⚠️ **Important Notes**

1. **Token Security**: JWT tokens are sensitive - don't share them with others
2. **Token Expiration**: Tokens expire after a certain time - you may need to get a new one
3. **Browser Specific**: Tokens are often stored per browser - try the same browser you use for Alpha.Date
4. **Login Required**: You must be logged into Alpha.Date to get a valid token

## 🎯 **Using the Token**

1. **Select "JWT Token (Bypass)"** in the login form
2. **Paste your JWT token** in the textarea
3. **Click Login** (email will be automatically extracted from the token)

## 🔍 **Troubleshooting**

### **If you can't find the token:**
- Make sure you're logged into Alpha.Date
- Try refreshing the page and checking again
- Look for different header names like `X-Auth-Token` or `token`
- Check both Network and Application tabs

### **If the token doesn't work:**
- The token might have expired - get a new one
- Make sure you copied the entire token
- Try logging out and back into Alpha.Date first

### **If you get "Invalid JWT token":**
- The token might be expired
- Try getting a fresh token from Alpha.Date
- Make sure you're copying the token correctly (no extra spaces)

### **If you get "Email not found in JWT token":**
- The JWT token might not contain email information
- Try getting a different token from Alpha.Date
- Make sure you're logged into the correct Alpha.Date account

## 🛡️ **Security Reminder**

- **Never share** your JWT token with anyone
- **Don't paste** it in public forums or chats
- **Treat it like** a password - keep it secure
- **Get a new token** if you suspect it's been compromised 