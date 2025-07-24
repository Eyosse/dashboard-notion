// update-data.js - Version locale
require('dotenv').config(); // Charge les variables d'environnement depuis .env

const { Client } = require('@notionhq/client');
const fs = require('fs');

// Vérification des variables d'environnement
if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_ID) {
	console.error('❌ Erreur : Les variables NOTION_API_KEY et NOTION_DATABASE_ID doivent être définies dans le fichier .env');
	process.exit(1);
}

// Configuration
const notion = new Client({ 
	auth: process.env.NOTION_API_KEY 
});

const databaseId = process.env.NOTION_DATABASE_ID;

console.log('🔧 Configuration :');
console.log('- Database ID:', databaseId);
console.log('- API Key:', process.env.NOTION_API_KEY.substring(0, 10) + '...');

// Fonction pour récupérer les données Notion

async function fetchNotionData() {
	console.log('\n📥 Récupération des données depuis Notion...');
	
	let allResults = [];
	let hasMore = true;
	let startCursor = undefined;
	let pageCount = 0;
	
	try {
		while (hasMore) {
			pageCount++;
			console.log(`📄 Récupération de la page ${pageCount}...`);
			
			const response = await notion.databases.query({
				database_id: databaseId,
				start_cursor: startCursor,
				page_size: 100 // Maximum par page
			});
			
			allResults = allResults.concat(response.results);
			hasMore = response.has_more;
			startCursor = response.next_cursor;
			
			console.log(`   ✓ ${response.results.length} entrées récupérées (Total: ${allResults.length})`);
		}
		
		console.log(`\n✅ Total : ${allResults.length} entrées récupérées en ${pageCount} page(s)`);
		return allResults;
		
	} catch (error) {
		console.error('❌ Erreur lors de la récupération des données:', error.message);
		
		// Aide au débogage
		if (error.code === 'object_not_found') {
			console.error('\n💡 Solutions possibles :');
			console.error('1. Vérifiez que l\'ID de la base de données est correct');
			console.error('2. Assurez-vous que l\'intégration a accès à la base');
			console.error('3. Dans Notion : Share > Add connections > Ajoutez votre intégration');
		} else if (error.code === 'unauthorized') {
			console.error('\n💡 Vérifiez que votre NOTION_API_KEY est correcte');
		}
		
		throw error;
	}
}

// Calculer les KPIs
function calculateKPIs(data) {
	console.log('\n📊 Calcul des KPIs...');
	
	const total = data.length;
	
	// Taux de réussite
	const success = data.filter(item => 
		item.properties['Statut']?.select?.name === 'Contrat signé'
	).length;
	const successRate = total > 0 ? Math.round((success / total) * 100) : 0;
	
	// Taux d'échec
	const failures = data.filter(item => 
		item.properties['Statut']?.select?.name === 'Réponse négative'
	).length;
	const failureRate = total > 0 ? Math.round((failures / total) * 100) : 0;
	
	// Taux sans réponse
	const noResponse = data.filter(item => 
		item.properties['Statut']?.select?.name === 'Pas de réponse'
	).length;
	const noResponseRate = total > 0 ? Math.round((noResponse / total) * 100) : 0;
	
	// Nombre d'appels moyen
	const totalCalls = data.reduce((sum, item) => {
		const calls = item.properties['Nombre d\'appel']?.number || 0;
		return sum + calls;
	}, 0);
	const avgCalls = total > 0 ? (totalCalls / total).toFixed(1) : 0;
	
	// Tarif moyen (uniquement sur les contrats signés)
	const successfulDeals = data.filter(item => 
		item.properties['Statut']?.select?.name === 'Contrat signé'
	);
	const totalRevenue = successfulDeals.reduce((sum, item) => {
		const revenue = item.properties['Tarif HT']?.number || 0;
		return sum + revenue;
	}, 0);
	const avgPrice = successfulDeals.length > 0 
		? Math.round(totalRevenue / successfulDeals.length) 
		: 0;
	
	// Répartition par lieu
	const venueStats = {
		'Rooftop': { total: 0, success: 0 },
		'Tama': { total: 0, success: 0 }
	};
	
	data.forEach(item => {
		const venues = item.properties['Lieu']?.multi_select || [];
		const isSuccess = item.properties['Statut']?.select?.name === 'Contrat signé';
		
		venues.forEach(venue => {
			if (venueStats[venue.name]) {
				venueStats[venue.name].total++;
				if (isSuccess) venueStats[venue.name].success++;
			}
		});
	});
	
	// Répartition par canal d'acquisition
	const channelStats = {};
	data.forEach(item => {
		const channel = item.properties['Canal d\'acquisition']?.select?.name || 'Non spécifié';
		if (!channelStats[channel]) {
			channelStats[channel] = 0;
		}
		if (item.properties['Statut']?.select?.name === 'Contrat signé') {
			channelStats[channel]++;
		}
	});
	
	// Top 5 canaux
	const topChannels = Object.entries(channelStats)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5);
	
	// Évolution mensuelle (derniers 6 mois)
	const monthlyData = {};
	const now = new Date();
	const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
	
	for (let i = 5; i >= 0; i--) {
		const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
		const monthKey = months[date.getMonth()];
		monthlyData[monthKey] = 0;
	}
	
	data.forEach(item => {
		const dateStr = item.properties['Date de demande']?.date?.start;
		if (dateStr) {
			const date = new Date(dateStr);
			const monthKey = months[date.getMonth()];
			if (monthlyData.hasOwnProperty(monthKey)) {
				monthlyData[monthKey]++;
			}
		}
	});
	
	// Raisons de refus
	const refusalReasons = {};
	data.filter(item => 
		item.properties['Statut']?.select?.name === 'Réponse négative'
	).forEach(item => {
		const reason = item.properties['Raison de refus']?.select?.name || 'Non spécifié';
		refusalReasons[reason] = (refusalReasons[reason] || 0) + 1;
	});
	
	console.log('✅ KPIs calculés :');
	console.log(`- Taux de réussite : ${successRate}%`);
	console.log(`- Nombre d'appels moyen : ${avgCalls}`);
	console.log(`- Tarif moyen : ${avgPrice}€`);
	
	return {
		total,
		successRate,
		failureRate,
		noResponseRate,
		avgCalls,
		avgPrice,
		venueStats,
		topChannels,
		monthlyData,
		refusalReasons,
		lastUpdate: new Date().toLocaleString('fr-FR')
	};
}

// Générer le HTML avec les données
function generateHTML(kpis) {
	console.log('\n🎨 Génération du dashboard HTML...');
	
	const htmlTemplate = `<!DOCTYPE html>
<html lang="fr">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Dashboard Commercial - ${kpis.lastUpdate}</title>
	<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}
		
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			background: #f7f7f7;
			padding: 20px;
		}
		
		.dashboard {
			max-width: 1400px;
			margin: 0 auto;
		}
		
		.header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 30px;
		}
		
		h1 {
			color: #1a1a1a;
			font-size: 28px;
		}
		
		.last-update {
			color: #666;
			font-size: 14px;
		}
		
		.kpi-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
			gap: 20px;
			margin-bottom: 40px;
		}
		
		.kpi-card {
			background: white;
			border-radius: 12px;
			padding: 24px;
			box-shadow: 0 2px 8px rgba(0,0,0,0.1);
			transition: transform 0.2s;
		}
		
		.kpi-card:hover {
			transform: translateY(-2px);
			box-shadow: 0 4px 12px rgba(0,0,0,0.15);
		}
		
		.kpi-value {
			font-size: 36px;
			font-weight: bold;
			margin: 10px 0;
		}
		
		.kpi-label {
			color: #666;
			font-size: 14px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}
		
		.positive { color: #10b981; }
		.negative { color: #ef4444; }
		.neutral { color: #3b82f6; }
		
		.chart-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
			gap: 30px;
			margin-bottom: 40px;
		}
		
		.chart-container {
			background: white;
			border-radius: 12px;
			padding: 24px;
			box-shadow: 0 2px 8px rgba(0,0,0,0.1);
		}
		
		.chart-title {
			font-size: 18px;
			font-weight: 600;
			margin-bottom: 20px;
			color: #1a1a1a;
		}
		
		canvas {
			max-height: 300px;
		}
		
		.progress-bar {
			width: 100%;
			height: 8px;
			background: #e5e5e5;
			border-radius: 4px;
			overflow: hidden;
			margin-top: 12px;
		}
		
		.progress-fill {
			height: 100%;
			background: linear-gradient(90deg, #3b82f6 0%, #10b981 100%);
			border-radius: 4px;
			transition: width 0.5s ease;
		}
		
		.data-table {
			background: white;
			border-radius: 12px;
			padding: 24px;
			box-shadow: 0 2px 8px rgba(0,0,0,0.1);
			overflow-x: auto;
		}
		
		table {
			width: 100%;
			border-collapse: collapse;
		}
		
		th, td {
			text-align: left;
			padding: 12px;
			border-bottom: 1px solid #e5e5e5;
		}
		
		th {
			font-weight: 600;
			color: #666;
			font-size: 14px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}
	</style>
</head>
<body>
	<div class="dashboard">
		<div class="header">
			<h1>📊 Dashboard Commercial</h1>
			<div class="last-update">Dernière mise à jour: ${kpis.lastUpdate}</div>
		</div>
		
		<!-- KPIs Principaux -->
		<div class="kpi-grid">
			<div class="kpi-card">
				<div class="kpi-label">Taux de Réussite</div>
				<div class="kpi-value positive">${kpis.successRate}%</div>
				<div class="progress-bar">
					<div class="progress-fill" style="width: ${kpis.successRate}%"></div>
				</div>
			</div>
			
			<div class="kpi-card">
				<div class="kpi-label">Nombre d'Appels Moyen</div>
				<div class="kpi-value neutral">${kpis.avgCalls}</div>
				<div class="kpi-label" style="margin-top: 10px">Par prospect</div>
			</div>
			
			<div class="kpi-card">
				<div class="kpi-label">Tarif Moyen</div>
				<div class="kpi-value neutral">${kpis.avgPrice.toLocaleString('fr-FR')}€</div>
				<div class="kpi-label" style="margin-top: 10px">HT par contrat</div>
			</div>
			
			<div class="kpi-card">
				<div class="kpi-label">Total Prospects</div>
				<div class="kpi-value">${kpis.total}</div>
				<div class="kpi-label" style="margin-top: 10px">Dans la base</div>
			</div>
		</div>
		
		<!-- Graphiques -->
		<div class="chart-grid">
			<div class="chart-container">
				<h3 class="chart-title">📈 Répartition des Statuts</h3>
				<canvas id="statusChart"></canvas>
			</div>
			
			<div class="chart-container">
				<h3 class="chart-title">📍 Performance par Lieu</h3>
				<canvas id="venueChart"></canvas>
			</div>
			
			<div class="chart-container">
				<h3 class="chart-title">📅 Évolution Mensuelle</h3>
				<canvas id="monthlyChart"></canvas>
			</div>
			
			<div class="chart-container">
				<h3 class="chart-title">🎯 Top Canaux d'Acquisition</h3>
				<canvas id="channelChart"></canvas>
			</div>
		</div>
		
		<!-- Tableau des raisons de refus -->
		${Object.keys(kpis.refusalReasons).length > 0 ? `
		<div class="data-table">
			<h3 class="chart-title">📋 Analyse des Refus</h3>
			<table>
				<thead>
					<tr>
						<th>Raison</th>
						<th>Nombre</th>
						<th>Pourcentage</th>
					</tr>
				</thead>
				<tbody>
					${Object.entries(kpis.refusalReasons)
						.sort((a, b) => b[1] - a[1])
						.map(([reason, count]) => `
							<tr>
								<td>${reason}</td>
								<td>${count}</td>
								<td>${Math.round((count / Object.values(kpis.refusalReasons).reduce((a, b) => a + b, 0)) * 100)}%</td>
							</tr>
						`).join('')}
				</tbody>
			</table>
		</div>
		` : ''}
	</div>
	
	<script>
		// Configuration des graphiques
		Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
		
		// Données pour les graphiques
		const kpis = ${JSON.stringify(kpis)};
		
		// Graphique des statuts
		new Chart(document.getElementById('statusChart'), {
			type: 'doughnut',
			data: {
				labels: ['Succès', 'Échecs', 'Sans réponse', 'En cours'],
				datasets: [{
					data: [
						kpis.successRate, 
						kpis.failureRate, 
						kpis.noResponseRate, 
						100 - kpis.successRate - kpis.failureRate - kpis.noResponseRate
					],
					backgroundColor: ['#10b981', '#ef4444', '#6b7280', '#3b82f6'],
					borderWidth: 0
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						position: 'bottom',
						padding: 20
					}
				}
			}
		});
		
		// Graphique par lieu
		new Chart(document.getElementById('venueChart'), {
			type: 'bar',
			data: {
				labels: Object.keys(kpis.venueStats),
				datasets: [
					{
						label: 'Total demandes',
						data: Object.values(kpis.venueStats).map(v => v.total),
						backgroundColor: '#3b82f6'
					},
					{
						label: 'Contrats signés',
						data: Object.values(kpis.venueStats).map(v => v.success),
						backgroundColor: '#10b981'
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				scales: {
					y: {
						beginAtZero: true
					}
				}
			}
		});
		
		// Graphique mensuel
		new Chart(document.getElementById('monthlyChart'), {
			type: 'line',
			data: {
				labels: Object.keys(kpis.monthlyData),
				datasets: [{
					label: 'Nombre de demandes',
					data: Object.values(kpis.monthlyData),
					borderColor: '#3b82f6',
					backgroundColor: 'rgba(59, 130, 246, 0.1)',
					tension: 0.4
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				scales: {
					y: {
						beginAtZero: true
					}
				}
			}
		});
		
		// Graphique des canaux
		new Chart(document.getElementById('channelChart'), {
			type: 'horizontalBar',
			data: {
				labels: kpis.topChannels.map(c => c[0]),
				datasets: [{
					label: 'Conversions',
					data: kpis.topChannels.map(c => c[1]),
					backgroundColor: ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444']
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				indexAxis: 'y',
				scales: {
					x: {
						beginAtZero: true
					}
				}
			}
		});
	</script>
</body>
</html>`;
	
	return htmlTemplate;
}

// Fonction principale
async function updateDashboard() {
	console.log('🚀 Début de la mise à jour du dashboard...\n');
	
	try {
		// Récupérer les données
		const data = await fetchNotionData();
		
		// Calculer les KPIs
		const kpis = calculateKPIs(data);
		
		// Générer le HTML
		const html = generateHTML(kpis);
		
		// Sauvegarder le fichier
		fs.writeFileSync('index.html', html);
		
		console.log('\n✅ Dashboard mis à jour avec succès!');
		console.log('📄 Fichier créé : index.html');
		console.log('\n💡 Ouvrez index.html dans votre navigateur pour voir le résultat');
		
	} catch (error) {
		console.error('\n❌ Erreur :', error.message);
		process.exit(1);
	}
}

// Exécuter la mise à jour
updateDashboard();