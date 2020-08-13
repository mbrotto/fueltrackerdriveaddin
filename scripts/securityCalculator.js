(function () {
    'use strict';
	let SecurityCalculator = function (securityGroups) {
			let applySecurityFilters = function (parentPermissions, filters) {
					let currentFilter,
						searchIndex,
						result = parentPermissions.slice(),
						compareSecurityIdentifiers = function (filter1, filter2) {
							return filter1.securityIdentifier === filter2.securityIdentifier;
						},
						mapPermission = function (permission) {
							var newPermission = Object.assign({}, permission);
							newPermission.isAdd = currentFilter.isAdd;
							return newPermission;
						},
						resultsReducer = function (itemIndex, currentItem, currentIndex) {
							return (itemIndex === -1 && compareSecurityIdentifiers(currentItem, currentFilter)) ? currentIndex : itemIndex;
						};

					if (!filters || !filters.length) {
						return parentPermissions;
					}

					for (let i = 0; i < filters.length; i++) {
						currentFilter = filters[i];

						if (currentFilter.securityIdentifier === 'Everything') {
							return parentPermissions.map(mapPermission);
						} else if (currentFilter.securityIdentifier === 'Unknown') {
							continue;
						}
						searchIndex = result.reduce(resultsReducer, -1);
						// Parent is assumed to have all possible filters regardless of add status
						if (searchIndex > -1) {
							result[searchIndex].isAdd = currentFilter.isAdd;
						}
					}

					return result;
				},
				populateParentNodesRecursive = function (groups, parent, groupsDictionary) {
					var i, id, node, nodeWithParent, children;
					for (i in groups) {
						node = groups[i];
						id = node.id;
						nodeWithParent = Object.assign({}, node, {
							parent: parent
						});
						groupsDictionary[id] = nodeWithParent;
						children = node.children || node.groups;
						if (children) {
							populateParentNodesRecursive(children, nodeWithParent, groupsDictionary);
						}
						if (id === 'GroupCompanyId') {
							// we traversed entire organization, all groups are populated
							break;
						}
					}
				},
				populateParentNodes = function (groups) {
					let groupsDictionary = {};
					populateParentNodesRecursive(groups, null, groupsDictionary);
					return groupsDictionary;
				},
				entityToDictionaryImpl = function (entities, entityCallback) {
					let entity, o = {},
						i,
						l = entities.length;

					for (i = 0; i < l; i++) {
						if (entities[i]) {
							entity = entities[i].id ? entities[i] : {
								id: entities[i]
							};
							o[entity.id] = entityCallback ? entityCallback(entity) : entity;
						}
					}
					return o;
				},
				createLinkedTree = function (groups) {
					let n,
						nodeLookup,
						treeArray = [],
						traverseChildren = function (node) {
							let i, ii,
								children,
								id,
								fullChild;

							children = node.children;

							if (children) {
								for (i = 0, ii = children.length; i < ii; i += 1) {
									id = children[i].id;
									fullChild = nodeLookup[id];
									fullChild.parent = node;

									if (fullChild) {
										node.children[i] = fullChild;
										delete nodeLookup[id];
									}
									traverseChildren(node.children[i]);
								}
							}
						};

					nodeLookup = entityToDictionaryImpl(groups, function (entity) {
						let newEntity = Object.assign({}, entity);
						if (newEntity.children) {
							newEntity.children = newEntity.children.slice();
							newEntity.groups = newEntity.children;
						}
						return newEntity;
					});

					for (n in nodeLookup) {
						if (nodeLookup.hasOwnProperty(n)) {
							traverseChildren(nodeLookup[n]);
						}
					}
					for (n in nodeLookup) {
						if (nodeLookup.hasOwnProperty(n)) {
							treeArray.push(nodeLookup[n]);
						}
					}
					return treeArray;
				},
				calculatePermissions = function (clearanceChain) {
					let currentPermissions = clearanceChain[0].securityFilters;

					for (let i = 1; i < clearanceChain.length; i++) {
						currentPermissions = applySecurityFilters(currentPermissions, clearanceChain[i].securityFilters);
					}

					return currentPermissions;
				},
				dictionary = populateParentNodes(createLinkedTree(securityGroups.slice())),
				populatePermissionsRecursive = function (clearance) {
					if (clearance.isVisited) {
						return;
					}
					// This is root
					if (!clearance.parent) {
						clearance.isVisited = true;
						return;
					}

					if (!clearance.parent.isVisited) {
						populatePermissionsRecursive(clearance.parent);
					}

					clearance.securityFilters = calculatePermissions([clearance.parent, clearance]);
					clearance.isVisited = true;
				},
				getClearance = function (clearance) {
					let internalClearance = dictionary[clearance.id];

					if (internalClearance) {
						populatePermissionsRecursive(internalClearance);
					}

					return internalClearance;
				},
				getUiConfiguration = function (clearance) {
					let uiConfiguration = {
							acl: [],
							containsAny: false
						},
						fullClearance = getClearance(clearance);

					if (fullClearance) {
						fullClearance.securityFilters.forEach(function (securityFilter) {
							if (securityFilter.isAdd) {
								uiConfiguration.acl.push(securityFilter.securityIdentifier);
								uiConfiguration.containsAny = true;
							}
						});
					}

					return uiConfiguration;
				};

			return {
				getUiConfiguration: getUiConfiguration
			};
		},
		globals;

	globals = (function () {
		return this || (0, eval)('this');
	}());

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = SecurityCalculator;
	} else if (typeof define === 'function' && define.amd) {
		define(function () {
			return SecurityCalculator;
		});
	} else {
		globals.SecurityCalculator = SecurityCalculator;
	}
}());
