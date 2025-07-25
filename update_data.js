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
			channelStats: {},
			topChannelsByRate: [],
			missingChannelRate: 0,
			pipelineData: {},
			pipelineStages: [],
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
	
	// Canal d'acquisition - VERSION AMÉLIORÉE
	const channelStats = {};
	const channelTotal = {};
	let missingChannelCount = 0;
	
	data.forEach(item => {
		// Essayer différentes orthographes possibles
		let channel = item.properties['Canal d\'acquisition']?.select?.name ||
					 item.properties['Canal d\'acquisition']?.select?.name ||
					 item.properties['Canal d\'acquisition']?.multi_select?.[0]?.name;
		
		// Si le canal est vide, compter séparément
		if (!channel || channel === '') {
			missingChannelCount++;
			channel = 'Non renseigné'; // Renommer pour plus de clarté
		}
		
		// Compter le total par canal
		channelTotal[channel] = (channelTotal[channel] || 0) + 1;
		
		// Initialiser le compteur de succès
		if (!channelStats[channel]) {
			channelStats[channel] = { conversions: 0, total: 0, rate: 0 };
		}
		channelStats[channel].total++;
		
		// Compter les succès
		const statusProp = item.properties['Statut'];
		const status = statusProp?.select?.name || statusProp?.status?.name;
		
		if (status === 'Contrat signé') {
			channelStats[channel].conversions++;
		}
	});
	
	// Calculer le taux de conversion par canal
	Object.keys(channelStats).forEach(channel => {
		const stats = channelStats[channel];
		stats.rate = stats.total > 0 ? Math.round((stats.conversions / stats.total) * 100) : 0;
	});
	
	// Préparer deux vues : par volume ET par taux de conversion
	
	// Afficher TOUS les canaux par VOLUME TOTAL (excluant "Non renseigné")
	const allChannelsByVolume = Object.entries(channelStats)
		.filter(([channel, stats]) => {
			// Exclure seulement "Non renseigné"
			return channel !== 'Non renseigné' && stats.total > 0;
		})
		.map(([channel, stats]) => [channel, stats]) // Garder toutes les stats
		.sort((a, b) => b[1].total - a[1].total)
		.slice(0, 10);
	
	// Top canaux par TAUX de conversion (minimum 5 prospects pour être significatif)
	const topChannelsByRate = Object.entries(channelStats)
		.filter(([channel, stats]) => stats.total >= 5 && stats.conversions > 0)
		.sort((a, b) => b[1].rate - a[1].rate)
		.slice(0, 5);
	
	console.log('\n📊 Analyse détaillée des canaux :');
	Object.entries(channelStats).forEach(([channel, stats]) => {
		console.log(`- ${channel}: ${stats.conversions} conversions sur ${stats.total} (${stats.rate}%)`);
	});
	console.log(`\n⚠️  Prospects sans canal renseigné : ${missingChannelCount} (${Math.round((missingChannelCount / data.length) * 100)}%)`);
	
	// Utiliser allChannelsByVolume comme topChannels
	const topChannels = allChannelsByVolume;
	
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
	
	// Pipeline de vente - Analyse du funnel avec tous les statuts
	const pipelineStages = [
		'Prospect',
		'Prospect qualifié',
		'En attente de visite',
		'À visité',
		'Contrat signé',
		'Réponse négative',
		'Pas de réponse'
	];
	
	// Compter les prospects à chaque étape
	const pipelineData = {};
	
	// Initialiser les compteurs
	pipelineStages.forEach(stage => {
		pipelineData[stage] = {
			count: 0,
			value: 0,
			percentage: 0
		};
	});
	
	// Compter et calculer les valeurs
	data.forEach(item => {
		const statusProp = item.properties['Statut'];
		const status = statusProp?.select?.name || statusProp?.status?.name;
		
		if (pipelineData[status] !== undefined) {
			pipelineData[status].count++;
			
			// Calculer la valeur (prix) pour chaque statut
			let price = item.properties['Tarif HT']?.number || 
						item.properties['CA HT']?.number || 0;
			
			if (!price && item.properties['Tarif final']?.rich_text?.[0]?.plain_text) {
				const match = item.properties['Tarif final'].rich_text[0].plain_text.match(/(\d+)/);
				if (match) price = parseInt(match[1]);
			}
			
			pipelineData[status].value += price;
		}
	});
	
	// Calculer les pourcentages par rapport au total
	pipelineStages.forEach(stage => {
		pipelineData[stage].percentage = total > 0 ? Math.round((pipelineData[stage].count / total) * 100) : 0;
	});
	
	// Calculer les statistiques de conversion
	const totalActive = pipelineData['Prospect'].count + 
					   pipelineData['Prospect qualifié'].count + 
					   pipelineData['En attente de visite'].count + 
					   pipelineData['À visité'].count;
	
	const conversionStats = {
		successRate: total > 0 ? Math.round((pipelineData['Contrat signé'].count / total) * 100) : 0,
		failureRate: total > 0 ? Math.round((pipelineData['Réponse négative'].count / total) * 100) : 0,
		noResponseRate: total > 0 ? Math.round((pipelineData['Pas de réponse'].count / total) * 100) : 0,
		activeRate: total > 0 ? Math.round((totalActive / total) * 100) : 0
	};
	
	console.log('\n📈 Analyse du pipeline complet :');
	pipelineStages.forEach(stage => {
		console.log(`- ${stage}: ${pipelineData[stage].count} (${pipelineData[stage].percentage}%)`);
	});
	
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
		channelStats,
		topChannelsByRate,
		missingChannelRate: Math.round((missingChannelCount / data.length) * 100),
		monthlyData,
		refusalReasons,
		tooExpensiveRate,
		pipelineData,
		pipelineStages,
		conversionStats,
		lastUpdate: new Date().toLocaleString('fr-FR')
	};
	
	// Créer un résumé des statistiques
	const statsHTML = `
		<h4 style="text-align: center; color: #1f2937; margin-bottom: 20px; font-weight: 600;">Résumé du Pipeline</h4>
		<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
			<div style="text-align: center;">
				<div style="font-size: 32px; font-weight: bold; color: #3b82f6;">${kpis.conversionStats ? kpis.conversionStats.activeRate : 0}%</div>
				<div style="font-size: 14px; color: #6b7280; margin-top: 4px;">Prospects actifs</div>
				<div style="font-size: 12px; color: #9ca3af; margin-top: 2px;">(En cours de traitement)</div>
			</div>
			<div style="text-align: center;">
				<div style="font-size: 32px; font-weight: bold; color: #10b981;">${kpis.conversionStats ? kpis.conversionStats.successRate : 0}%</div>
				<div style="font-size: 14px; color: #6b7280; margin-top: 4px;">Taux de conversion</div>
				<div style="font-size: 12px; color: #9ca3af; margin-top: 2px;">(${kpis.pipelineData ? kpis.pipelineData['Contrat signé'].count : 0} contrats signés)</div>
			</div>
			<div style="text-align: center;">
				<div style="font-size: 32px; font-weight: bold; color: #ef4444;">${kpis.conversionStats ? kpis.conversionStats.failureRate : 0}%</div>
				<div style="font-size: 14px; color: #6b7280; margin-top: 4px;">Taux d'échec</div>
				<div style="font-size: 12px; color: #9ca3af; margin-top: 2px;">(${kpis.pipelineData ? kpis.pipelineData['Réponse négative'].count : 0} refus)</div>
			</div>
			<div style="text-align: center;">
				<div style="font-size: 32px; font-weight: bold; color: #f59e0b;">${kpis.conversionStats ? kpis.conversionStats.noResponseRate : 0}%</div>
				<div style="font-size: 14px; color: #6b7280; margin-top: 4px;">Sans réponse</div>
				<div style="font-size: 12px; color: #9ca3af; margin-top: 2px;">(${kpis.pipelineData ? kpis.pipelineData['Pas de réponse'].count : 0} abandons)</div>
			</div>
		</div>
	`;
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
		
		.warning-box {
			background: #fef3c7;
			border: 1px solid #f59e0b;
			padding: 12px;
			border-radius: 8px;
			margin-bottom: 20px;
		}
		
		.warning-box p {
			color: #92400e;
			margin: 0;
		}
		
		.simple-stats {
			padding: 20px;
		}
		
		.stat-item {
			margin-bottom: 15px;
			padding: 15px;
			background: #f3f4f6;
			border-radius: 8px;
		}
		
		.stat-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
		}
		
		.stat-detail {
			margin-top: 8px;
			font-size: 14px;
			color: #666;
		}
		
		/* Style pour les légendes barrées */
		.chartjs-legend li.hidden {
			text-decoration: line-through;
			opacity: 0.5;
		}
		
		.pipeline-container {
			grid-column: span 2;
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
				<h3 class="chart-title">🎯 Répartition des Prospects par Canal d'Acquisition</h3>
				${kpis.missingChannelRate > 70 ? 
					`<div class="warning-box">
						<p>⚠️ ${kpis.missingChannelRate}% des prospects n'ont pas de canal renseigné</p>
					</div>` : ''
				}
				${kpis.topChannels.length > 0 ? 
					'<canvas id="channelChart"></canvas>' : 
					'<div class="no-data">Aucun canal d\'acquisition renseigné. Assurez-vous de bien remplir ce champ dans vos prospects.</div>'
				}
			</div>
			
			<!-- Pipeline de vente -->
			<div class="chart-container pipeline-container">
				<h3 class="chart-title">🎯 Pipeline de Vente</h3>
				<canvas id="pipelineChart" style="max-height: 400px;"></canvas>
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
		
		// Graphique des canaux en CAMEMBERT (pie chart) - Volume avec conversions dans la légende
		if (kpis.topChannels.length > 0) {
			const ctx = document.getElementById('channelChart');
			// Utiliser le volume total (pas les conversions)
			const channelData = kpis.topChannels.map(c => c[1].total);
			const channelLabels = kpis.topChannels.map(c => c[0]);
			
			// Couleurs pour le camembert
			const colors = [
				'#10b981', // Vert
				'#3b82f6', // Bleu
				'#8b5cf6', // Violet
				'#f59e0b', // Orange
				'#ef4444', // Rouge
				'#6366f1', // Indigo
				'#14b8a6', // Teal
				'#f97316', // Orange foncé
				'#a78bfa', // Violet clair
				'#60a5fa'  // Bleu clair
			];
			
			new Chart(ctx, {
				type: 'pie',
				data: {
					labels: channelLabels,
					datasets: [{
						data: channelData,
						backgroundColor: colors.slice(0, channelData.length),
						borderWidth: 2,
						borderColor: '#fff'
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: {
							position: 'right',
							labels: {
								padding: 15,
								font: {
									size: 12
								},
								generateLabels: function(chart) {
									const data = chart.data;
									if (data.labels.length && data.datasets.length) {
										const dataset = data.datasets[0];
										const meta = chart.getDatasetMeta(0);
										const total = dataset.data.reduce((a, b) => a + b, 0);
										
										return data.labels.map((label, i) => {
											const value = dataset.data[i];
											const percentage = ((value / total) * 100).toFixed(1);
											const stats = kpis.channelStats[label];
											const conversions = stats ? stats.conversions : 0;
											
											// Vérifier si l'élément est caché
											const hidden = meta.data && meta.data[i] && meta.data[i].hidden;
											
											// Afficher : Canal (X%) - Y conversions
											return {
												text: label + ' (' + percentage + '%) - ' + conversions + ' conv.',
												fillStyle: dataset.backgroundColor[i],
												strokeStyle: dataset.borderColor || '#fff',
												lineWidth: dataset.borderWidth || 0,
												hidden: hidden,
												index: i,
												// Style pour les éléments cachés
												textDecoration: hidden ? 'line-through' : '',
												fontColor: hidden ? 'rgba(0,0,0,0.4)' : ''
											};
										});
									}
									return [];
								}
							},
							onClick: function(e, legendItem, legend) {
								const index = legendItem.index;
								const chart = legend.chart;
								const meta = chart.getDatasetMeta(0);
								
								// Toggle la visibilité
								meta.data[index].hidden = !meta.data[index].hidden;
								
								// Mettre à jour le style de la légende
								legendItem.hidden = meta.data[index].hidden;
								
								// Ajouter/retirer la classe pour le style barré
								if (meta.data[index].hidden) {
									legendItem.textDecoration = 'line-through';
									legendItem.fontColor = 'rgba(0,0,0,0.4)';
								} else {
									legendItem.textDecoration = '';
									legendItem.fontColor = '';
								}
								
								// Redessiner le graphique
								chart.update();
							}
						},
						tooltip: {
							callbacks: {
								label: function(context) {
									const channel = context.label;
									const value = context.parsed;
									const stats = kpis.channelStats[channel];
									const total = context.dataset.data.reduce((a, b) => a + b, 0);
									const percentage = ((value / total) * 100).toFixed(1);
									
									if (stats) {
										return [
											channel + ': ' + value + ' prospects (' + percentage + '%)',
											'Conversions: ' + stats.conversions,
											'Taux de conversion: ' + stats.rate + '%'
										];
									}
									return channel + ': ' + value + ' prospects (' + percentage + '%)';
								}
							}
						}
					}
				}
			});
		}
		
		// Graphique du pipeline de vente - BARRES VERTICALES
		if (kpis.pipelineData && kpis.pipelineStages) {
			const pipelineCtx = document.getElementById('pipelineChart');
			
			// Préparer les données pour les barres
			const barData = kpis.pipelineStages.map(stage => {
				const data = kpis.pipelineData[stage];
				return data ? data.count : 0;
			});
			
			// Labels simplifiés
			const barLabels = kpis.pipelineStages;
			
			// Couleurs différentes pour chaque type de statut
			const barColors = [
				'#3b82f6', // Bleu pour Prospect
				'#6366f1', // Indigo pour Qualifié
				'#8b5cf6', // Violet pour En attente
				'#a78bfa', // Violet clair pour Visité
				'#10b981', // Vert pour Signé (succès)
				'#ef4444', // Rouge pour Réponse négative (échec)
				'#f59e0b'  // Orange pour Pas de réponse
			];
			
			// Créer le graphique en barres verticales
			new Chart(pipelineCtx, {
				type: 'bar',
				data: {
					labels: barLabels,
					datasets: [{
						label: 'Nombre de prospects',
						data: barData,
						backgroundColor: barColors,
						borderWidth: 0
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: {
							display: false
						},
						tooltip: {
							callbacks: {
								label: function(context) {
									const stage = kpis.pipelineStages[context.dataIndex];
									const data = kpis.pipelineData[stage];
									const value = data ? data.value : 0;
									
									return [
										'Nombre: ' + context.parsed.y + ' prospects',
										'Pourcentage du total: ' + (data ? data.percentage : 0) + '%',
										'Valeur totale: ' + value.toLocaleString('fr-FR') + '€',
										'Valeur moyenne: ' + (data && data.count > 0 ? Math.round(value / data.count) : 0).toLocaleString('fr-FR') + '€'
									];
								}
							}
						}
					},
					scales: {
						y: {
							beginAtZero: true,
							ticks: {
								precision: 0
							},
							title: {
								display: true,
								text: 'Nombre de prospects'
							}
						},
						x: {
							ticks: {
								autoSkip: false,
								maxRotation: 45,
								minRotation: 45,
								font: {
									size: 11
								}
							}
						}
					}
				}
			});
			
			// Ajouter des statistiques de synthèse sous le graphique
			const statsContainer = document.createElement('div');
			statsContainer.style.marginTop = '30px';
			statsContainer.style.padding = '20px';
			statsContainer.style.backgroundColor = '#f9fafb';
			statsContainer.style.borderRadius = '8px';
			statsContainer.innerHTML = statsHTML;
			pipelineCtx.parentElement.appendChild(statsContainer);
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