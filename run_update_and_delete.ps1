# PowerShell script to run SQL update and delete the file
# This script will execute the SQL file and then delete it

Write-Host "🚀 Starting database table updates..." -ForegroundColor Green

# Database connection parameters (update these as needed)
$DB_HOST = "localhost"
$DB_PORT = "5432"
$DB_NAME = "dirasiq_db"
$DB_USER = "postgres"
$DB_PASSWORD = "your_password_here"

# SQL file path
$SQL_FILE = "update_tables.sql"

# Check if SQL file exists
if (-not (Test-Path $SQL_FILE)) {
    Write-Host "❌ SQL file not found: $SQL_FILE" -ForegroundColor Red
    exit 1
}

Write-Host "📁 Found SQL file: $SQL_FILE" -ForegroundColor Yellow

# Execute SQL file using psql
try {
    Write-Host "🔧 Executing SQL updates..." -ForegroundColor Cyan

    # Set PGPASSWORD environment variable
    $env:PGPASSWORD = $DB_PASSWORD

    # Run psql command
    $result = psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f $SQL_FILE 2>&1

    # Check if command was successful
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ SQL updates executed successfully!" -ForegroundColor Green

        # Delete the SQL file
        Write-Host "🗑️ Deleting SQL file..." -ForegroundColor Yellow
        Remove-Item $SQL_FILE -Force

        if (Test-Path $SQL_FILE) {
            Write-Host "❌ Failed to delete SQL file" -ForegroundColor Red
        } else {
            Write-Host "✅ SQL file deleted successfully!" -ForegroundColor Green
        }

        Write-Host "🎉 All operations completed successfully!" -ForegroundColor Green
        Write-Host "📊 Database tables have been updated:" -ForegroundColor Cyan
        Write-Host "   • Users table: latitude/longitude now use NUMERIC type" -ForegroundColor White
        Write-Host "   • Courses table: new unique constraint added" -ForegroundColor White
        Write-Host "   • Better precision for location coordinates" -ForegroundColor White
        Write-Host "   • Teachers can create courses with same name for different grades" -ForegroundColor White

    } else {
        Write-Host "❌ SQL execution failed with exit code: $LASTEXITCODE" -ForegroundColor Red
        Write-Host "Error output:" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
    }

} catch {
    Write-Host "❌ Error executing SQL: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    # Clear password from environment
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host "`n🏁 Script execution completed!" -ForegroundColor Green
