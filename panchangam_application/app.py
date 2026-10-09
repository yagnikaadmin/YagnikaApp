from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from datetime import datetime, timezone, timedelta
import uvicorn

# Import your existing logic
from panchangam import compute_panchangam

app = FastAPI(title="Panchangam Web App")

# Mount the static directory so the HTML can load your .webp images
app.mount("/static", StaticFiles(directory="static"), name="static")

# Point FastAPI to your HTML folder
templates = Jinja2Templates(directory="templates")

# Default Location: Hyderabad, India (as used in your script's main function)
LATITUDE = 17.3871
LONGITUDE = 79.4916
TZ_OFFSET_MIN = 330  # IST is UTC+5:30

def get_target_date(date_str: str | None) -> datetime.date:
    """Helper to parse a date string or return today's date in IST."""
    if date_str:
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            pass
            
    # Default to current date in IST
    ist_tz = timezone(timedelta(minutes=TZ_OFFSET_MIN))
    return datetime.now(ist_tz).date()

@app.get("/", response_class=HTMLResponse)
async def serve_homepage(request: Request, date: str | None = None):
    """
    Renders the Homepage.html. 
    Expects an optional '?date=YYYY-MM-DD' query parameter.
    """
    target_date = get_target_date(date)
    
    # Compute the panchangam data using your script
    panchangam_data = compute_panchangam(target_date, LATITUDE, LONGITUDE, TZ_OFFSET_MIN)
    
    # Pass the data to the HTML template
    return templates.TemplateResponse(
        request=request,
        name="homepage_updated.html",
        context={"panchangam": panchangam_data, "selected_date": target_date.isoformat()}
    )

@app.get("/api/panchangam")
async def api_panchangam(date: str | None = None):
    """
    JSON API Endpoint.
    If your UI uses Javascript (fetch/AJAX) to load data, it should call this.
    """
    target_date = get_target_date(date)
    
    # FastAPI automatically converts dictionaries to JSON responses
    panchangam_data = compute_panchangam(target_date, LATITUDE, LONGITUDE, TZ_OFFSET_MIN)
    
    return panchangam_data

if __name__ == "__main__":
    # Run the web application on local port 8000
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
