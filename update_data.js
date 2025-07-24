// update-data.js - Version corrigée
require('dotenv').config();

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

// Fonction pour récupérer les données Notion avec pagination
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
				page_size: 100
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
		throw error;
	}
}

// Calculer les KPIs - VERSION CORRIGÉE
function calculateKPIs(data) {
	console.log('\n📊 Calcul des KPIs...');
	
	const total = data.length;
	
	if (total === 0) {
		console.log('⚠️ Aucune donnée à traiter');
		return {
			total: 0,
			successRate: 0,
			failureRate: 0,
			noResponseRate: 0,
			avgCalls: 0,
			avgPrice: 0,
			venueStats: { 'Rooftop': { total: 0, success: 0 }, 'Tama': { total: 0, success: 0 } },
			topChannels: [],
			monthlyData: {},
			refusalReasons: {},
			tooExpensiveRate: 0,
			lastUpdate: new Date().toLocaleString('fr-FR')
		};
	}

	// DEBUG - Voir la structure exacte
	console.log('\n🔍 Analyse de la structure :');
	if (data[0]) {
		const statut = data[0].properties['Statut'];
		console.log('Type de Statut :', statut?.type);
		if (statut?.select) {
			console.log('Exemple valeur Statut :', statut.select.name);
		} else if (statut?.status) {
			console.log('Exemple valeur Statut (status) :', statut.status.name);
		}
	}
	
	// Taux de réussite - Gérer les deux types possibles
	const success = data.filter(item => {
		const statusProp = item.properties['Statut'];
		const status = statusProp?.select?.name || statusProp?.status?.name;
		return status === 'Contrat signé';
	}).length;
	const successRate = Math.round((success / total) * 100);
	
	// Taux d'échec
	const failures = data.filter(item => {
		const statusProp = item.properties['Statut'];
		const status = statusProp?.select?.name || statusProp?.status?.name;
		return status === 'Réponse négative';
	}).length;
	const failureRate = Math.round((failures / total) * 100);
	
	// Taux sans réponse
	const noResponse = data.filter(item => {
		const statusProp = item.properties['Statut'];
		const status = statusProp?.select?.name || statusProp?.status?.name;
		return status === 'Pas de réponse';
	}).length;
	const noResponseRate = Math.round((noResponse / total) * 100);
	
	// Nombre d'appels moyen - EXCLURE LES ZÉROS ET VALEURS NULLES
	let totalCalls = 0;
	let countWithCalls = 0;
	
	data.forEach(item => {
		const calls = item.properties['Nombre d\'appel']?.number;
		// Ne compter que les valeurs > 0
		if (calls && calls > 0) {
			totalCalls += calls;
			countWithCalls++;
		}
	});
	
	const avgCalls = countWithCalls > 0 ? (totalCalls / countWithCalls).toFixed(1) : 0;
	console.log(`Nombre d'appels : ${countWithCalls} prospects avec appels, moyenne : ${avgCalls}`);
	
	// Tarif moyen (uniquement sur les contrats signés)
	const successfulDeals = data.filter(item => {
		const statusProp = item.properties['Statut'];
		const status = statusProp?.select?.name || statusProp?.status?.name;
		return status === 'Contrat signé';
	});
	
	let totalRevenue = 0;
	let dealsWithPrice = 0;
	
	successfulDeals.forEach(item => {
		// Essayer tous les champs possibles pour le tarif
		let price = item.properties['Tarif HT']?.number || 0;
		
		// Si Tarif HT est vide, essayer CA HT
		if (!price || price === 0) {
			price = item.properties['CA HT']?.number || 0;
		}
		
		// Si toujours vide, essayer Tarif final (peut être du texte)
		if (!price || price === 0) {
			const tarifFinal = item.properties['Tarif final']?.rich_text?.[0]?.plain_text || 
							  item.properties['Tarif final']?.title?.[0]?.plain_text || '';
			// Extraire le nombre du texte
			const match = tarifFinal.match(/(\d+)/);
			if (match) {
				price = parseInt(match[1]);
			}
		}
		
		if (price > 0) {
			totalRevenue += price;
			dealsWithPrice++;
		}
	});
	
	const avgPrice = dealsWithPrice > 0 ? Math.round(totalRevenue / dealsWithPrice) : 0;
	console.log(`Tarif moyen : ${dealsWithPrice} contrats avec prix, moyenne : ${avgPrice}€`);
	
	// Répartition par lieu
	const venueStats = {
		'Rooftop': { total: 0, success: 0 },
		'Tama': { total: 0, success: 0 }
	};
	
	data.forEach(item => {
		const venues = item.properties['Lieu']?.multi_select || [];
		const statusProp = item.properties['Statut'];
		const status = statusProp?.select?.name || statusProp?.status?.name;
		const isSuccess = status === 'Contrat signé';
		
		venues.forEach(venue => {
			if (venueStats[venue.name]) {
				venueStats[venue.name].total++;
				if (isSuccess) venueStats[venue.name].success++;
			}
		});
	});
	
	// Canal d'acquisition - CORRECTION IMPORTANTE
	const channelStats = {};
	const channelTotal = {};
	
	data.forEach(item => {
		// Essayer différentes orthographes possibles
		let channel = item.properties['Canal d\'acquisition']?.select?.name ||
					 item.properties['Canal d\'acquisition']?.select?.name ||
					 item.properties['Canal d\'acquisition']?.multi_select?.[0]?.name;
		
		if (!channel || channel === '') {
			channel = 'Non spécifié';
		}
		
		// Compter le total par canal
		channelTotal[channel] = (channelTotal[channel] || 0) + 1;
		
		// Compter seulement les succès
		const statusProp = item.properties['Statut'];
		const status = statusProp?.select?.name || statusProp?.status?.name;
		
		if (status === 'Contrat signé') {
			channelStats[channel] = (channelStats[channel] || 0) + 1;
		}
	});
	
	// Top 5 canaux par nombre de CONVERSIONS (pas total)
	const topChannels = Object.entries(channelStats)
		.filter(([channel, count]) => count > 0) // Exclure les canaux sans conversion
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5);
	
	console.log('Canaux trouvés :', Object.keys(channelTotal));
	console.log('Top canaux avec conversions :', topChannels);
	
	// Évolution mensuelle
	const monthlyData = {};
	const now = new Date();
	const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
	
	// Initialiser les 6 derniers mois
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
	
	data.filter(item => {
		const statusProp = item.properties['Statut'];
		const status = statusProp?.select?.name || statusProp?.status?.name;
		return status === 'Réponse négative';
	}).forEach(item => {
		const reason = item.properties['Raison de refus']?.select?.name || 'Non spécifié';
		refusalReasons[reason] = (refusalReasons[reason] || 0) + 1;
	});
	
	// Taux "Prix trop cher"
	const tooExpensiveCount = refusalReasons['Trop Cher'] || 0;
	const totalRefusals = Object.values(refusalReasons).reduce((a, b) => a + b, 0);
	const tooExpensiveRate = totalRefusals > 0 ? Math.round((tooExpensiveCount / totalRefusals) * 100) : 0;
	
	console.log('\n✅ KPIs calculés :');
	console.log(`- Taux de réussite : ${successRate}% (${success}/${total})`);
	console.log(`- Taux d'échec : ${failureRate}%`);
	console.log(`- Taux sans réponse : ${noResponseRate}%`);
	console.log(`- Nombre d'appels moyen : ${avgCalls}`);
	console.log(`- Tarif moyen : ${avgPrice}€`);
	console.log(`- Canaux avec conversions : ${topChannels.length}`);
	
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
		tooExpensiveRate,
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
			grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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
		
		.kpi-sublabel {
			color: #999;
			font-size: 12px;
			margin-top: 5px;
		}
		
		.positive { color: #10b981; }
		.negative { color: #ef4444; }
		.neutral { color: #3b82f6; }
		.warning { color: #f59e0b; }
		
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
		
		.no-data {
			text-align: center;
			color: #999;
			padding: 40px;
			font-style: italic;
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
				<div class="kpi-value ${kpis.successRate > 50 ? 'positive' : kpis.successRate > 30 ? 'warning' : 'negative'}">${kpis.successRate}%</div>
				<div class="progress-bar">
					<div class="progress-fill" style="width: ${kpis.successRate}%"></div>
				</div>
			</div>
			
			<div class="kpi-card">
				<div class="kpi-label">Nombre d'Appels Moyen</div>
				<div class="kpi-value neutral">${kpis.avgCalls}</div>
				<div class="kpi-sublabel">Par prospect contacté</div>
			</div>
			
			<div class="kpi-card">
				<div class="kpi-label">Tarif Moyen</div>
				<div class="kpi-value neutral">${kpis.avgPrice.toLocaleString('fr-FR')}€</div>
				<div class="kpi-sublabel">HT par contrat signé</div>
			</div>
			
			<div class="kpi-card">
				<div class="kpi-label">Total Prospects</div>
				<div class="kpi-value">${kpis.total}</div>
				<div class="kpi-sublabel">Dans la base</div>
			</div>
			
			<div class="kpi-card">
				<div class="kpi-label">Taux "Prix trop cher"</div>
				<div class="kpi-value ${kpis.tooExpensiveRate > 50 ? 'negative' : kpis.tooExpensiveRate > 30 ? 'warning' : 'positive'}">${kpis.tooExpensiveRate}%</div>
				<div class="kpi-sublabel">Des refus</div>
			</div>
			
			<div class="kpi-card">
				<div class="kpi-label">Sans Réponse</div>
				<div class="kpi-value warning">${kpis.noResponseRate}%</div>
				<div class="kpi-sublabel">Des prospects</div>
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
				${kpis.topChannels.length > 0 ? '<canvas id="channelChart"></canvas>' : '<div class="no-data">Aucune conversion enregistrée par canal</div>'}
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
					backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#3b82f6'],
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
					},
					tooltip: {
						callbacks: {
							label: function(context) {
								return context.label + ': ' + context.parsed + '%';
							}
						}
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
						beginAtZero: true,
						ticks: {
							precision: 0
						}
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
						beginAtZero: true,
						ticks: {
							precision: 0
						}
					}
				}
			}
		});
		
		// Graphique des canaux (seulement si des données existent)
		if (kpis.topChannels.length > 0) {
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
							beginAtZero: true,
							ticks: {
								precision: 0
							}
						}
					}
				}
			});
		}
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
		
	} catch (error) {
		console.error('\n❌ Erreur :', error.message);
		process.exit(1);
	}
}

// Exécuter la mise à jour
updateDashboard();