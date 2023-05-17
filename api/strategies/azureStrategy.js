const passport = require("passport");
const OIDCStrategy = require("passport-azure-ad").OIDCStrategy;

if (process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET) {
  passport.use(
    new OIDCStrategy(
      {
        identityMetadata: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0/.well-known/openid-configuration`,
        clientID: process.env.AZURE_CLIENT_ID,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
        responseType: "code",
        responseMode: "query",
        redirectUrl: "http://localhost:3080/oauth/azure/callback",
        allowHttpForRedirectUrl: true,
        scope: ["openid", "profile", "email"],
        passReqToCallback: true,
      },
      (req, iss, sub, profile, accessToken, refreshToken, done) => {
        if (!profile.oid) {
          return done(new Error("No email found"), null);
        }
        process.nextTick(() => {
          const user = {
            profile,
            accessToken,
            refreshToken,
          };
          // Assuming you have a function called "findOrCreateUser" that finds or creates a user in your database based on the profile information
          findOrCreateUser(profile, (err, user) => {
            if (err) {
              return done(err, null);
            }
            return done(null, { ...user, source: 'azuread' });
          });
        });
      }
    )
  );
}

