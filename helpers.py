from datetime import datetime
from functools import wraps

from flask import redirect, render_template, session


def apology(message, code=400):
    """Render an error page with a message and HTTP status code."""
    return render_template("apology.html", message=message, code=code), code


def login_required(f):
    """
    Decorate routes to require login.

    https://flask.palletsprojects.com/en/latest/patterns/viewdecorators/
    """

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if session.get("user_id") is None:
            return redirect("/login")
        return f(*args, **kwargs)

    return decorated_function


def lbs(value):
    """Format a weight in pounds: 225 -> '225 lb', 22.5 -> '22.5 lb', 0 -> 'Bodyweight'."""
    if value == 0:
        return "Bodyweight"
    if float(value).is_integer():
        return f"{int(value):,} lb"
    return f"{value:,.1f} lb"


def pretty_date(value):
    """Turn '2026-09-30' into 'Sep 30, 2026'. Works on Windows, Mac, and Linux."""
    try:
        d = datetime.strptime(value, "%Y-%m-%d")
        return f"{d:%b} {d.day}, {d.year}"
    except (TypeError, ValueError):
        return value
