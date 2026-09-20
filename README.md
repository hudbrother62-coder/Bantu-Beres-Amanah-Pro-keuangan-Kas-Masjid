# Bantu Beres Amanah Pro
Frontend produksi untuk pengelolaan Keuangan & Kas Masjid. Vite + React. Tahap ini memakai state demo lokal; adapter backend Supabase akan menggantikannya tanpa mengubah UI flow.

## Run
`npm install && npm run dev`

## Build
`npm run build`

## Prinsip ledger
Dana = peruntukan uang. Kas = lokasi uang. Transfer antar kas tidak dihitung sebagai pemasukan/pengeluaran. Transaksi tercatat tidak dihapus permanen; koreksi menggunakan void/reversal pada backend.
