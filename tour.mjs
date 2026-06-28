# GCS Tour App — Netlify configuration
[build]
  publish = "."
  functions = "netlify/functions"

# Safety net: never serve the data spreadsheet even if it ends up in the repo.
# It contains contact numbers and medical/dietary info, so it must stay private.
[[redirects]]
  from = "/*.xlsx"
  to = "/index.html"
  status = 404
  force = true
