using Microsoft.AspNetCore.DataProtection;
using SageAPI.Configuration;
using SageAPI.Interfaces;
using SageAPI.Services;

var builder = WebApplication.CreateBuilder(args);

// =======================
// Services
// =======================

// Sage / App services
builder.Services.AddScoped<IConfigService, ConfigService>();

builder.Services.AddScoped<IDatabaseService>(provider =>
{
    var configService = provider.GetRequiredService<IConfigService>();
    var connectionString = configService.GetConnectionString("DefaultConnection");
    return new DatabaseService(connectionString);
});

builder.Services.Configure<SageSettings>(
    builder.Configuration.GetSection("Sage")
);

// Encryption keys for saved secrets (the SQL password in appsettings.json). Kept outside the
// publish folder and, on Windows, protected with DPAPI so the files are useless on another machine.
var keysPath = builder.Configuration["Staging:KeysPath"]
    ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "SageAPI", "keys");
var dataProtection = builder.Services.AddDataProtection()
    .SetApplicationName("SageAPI")
    .PersistKeysToFileSystem(new DirectoryInfo(keysPath));
if (OperatingSystem.IsWindows())
    dataProtection.ProtectKeysWithDpapi(protectToLocalMachine: true);

builder.Services.AddSingleton<IConnectionSettingsStore, ConnectionSettingsStore>();
builder.Services.AddScoped<IStoreCategoryService, StoreCategoryService>();
builder.Services.AddScoped<IStoreDocumentService, StoreDocumentService>();

builder.Services.AddSingleton<ISageConnection, SageConnectionService>();
builder.Services.AddScoped<IGLJournal, GLJournalService>();
builder.Services.AddScoped<ICashBookBatch, CashBookbatchService>();
builder.Services.AddScoped<IARTransactions, ARTransactionService>();
builder.Services.AddScoped<IAccount, AccountService>();
builder.Services.AddScoped<ISalesOrder, SalesOrderService>();
builder.Services.AddScoped<IInventory, InventoryService>();
builder.Services.AddScoped<ICustomer, CustomerService>();

// Controllers & Swagger
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// =======================
// Middleware
// =======================

//if (app.Environment.IsDevelopment())
//{
    app.UseSwagger();
    app.UseSwaggerUI();
//}

app.UseHttpsRedirection();

// The Sage Evolution SDK keeps its database connection in shared static state (DatabaseContext),
// so two requests at once corrupt each other ("not a valid Evolution database", wrong branch ID...).
// Run requests that touch Sage one at a time. Settings and store data (categories) use plain SQL,
// not the SDK, so they skip the queue.
var sageGate = new SemaphoreSlim(1, 1);
app.Use(async (context, next) =>
{
    var path = context.Request.Path;
    if (!path.StartsWithSegments("/api/Pastel") ||
        path.StartsWithSegments("/api/Pastel/settings") ||
        path.StartsWithSegments("/api/Pastel/store"))
    {
        await next();
        return;
    }

    await sageGate.WaitAsync(context.RequestAborted);
    try
    {
        await next();
    }
    finally
    {
        sageGate.Release();
    }
});

app.MapControllers();

app.Run();
