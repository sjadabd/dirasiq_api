"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeDatabase = initializeDatabase;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const database_1 = __importDefault(require("../config/database"));
async function initializeDatabase() {
    try {
        const migrationsDir = path_1.default.join(__dirname, 'migrations');
        const migrationFiles = fs_1.default.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();
        for (const file of migrationFiles) {
            const filePath = path_1.default.join(migrationsDir, file);
            const sql = fs_1.default.readFileSync(filePath, 'utf8');
            await database_1.default.query(sql);
        }
    }
    catch (error) {
        console.error('❌ Database initialization failed:', error);
        throw error;
    }
}
if (require.main === module) {
    initializeDatabase()
        .then(() => {
        process.exit(0);
    })
        .catch((error) => {
        console.error('❌ Database setup failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=init.js.map