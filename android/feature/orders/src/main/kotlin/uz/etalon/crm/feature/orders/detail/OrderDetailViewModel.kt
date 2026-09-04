package uz.etalon.crm.feature.orders.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.OrdersRepository
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.Resource

@HiltViewModel(assistedFactory = OrderDetailViewModel.Factory::class)
class OrderDetailViewModel @AssistedInject constructor(private val repo: OrdersRepository, @Assisted val orderId: String) : ViewModel() {
    @AssistedFactory
    interface Factory {
        fun create(orderId: String): OrderDetailViewModel
    }

    val state: StateFlow<Resource<OrderDetail>> = repo.detail(orderId).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), Resource.Loading(null))
    init { refresh() }
    fun refresh() { viewModelScope.launch { repo.refreshDetail(orderId) } }
}
